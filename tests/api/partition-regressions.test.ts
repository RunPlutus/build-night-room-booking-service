import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase, loadSeed } from '../../src/db';
import { App, availability, book, booking } from '../helpers/app';

const whole = 'rm-summit';
const halves = ['rm-summit-a', 'rm-summit-b'];
const date = '2026-11-03';

function replicas() {
  const db = createDatabase({
    seed: { rooms: loadSeed().rooms.filter((room) => [whole, ...halves].includes(room.id)), bookings: [] },
    latencyMs: 2,
  });
  return { db, first: createApp({ db }), second: createApp({ db }) };
}

function meeting(roomId: string, start = '13:00', end = '14:00') {
  return booking(roomId, `${date}T${start}`, `${date}T${end}`);
}

async function busyIds(app: App, roomId: string): Promise<string[]> {
  const response = await availability(app, roomId, date).expect(200);
  expect(response.body.roomId).toBe(roomId);
  return response.body.busy.map((period: { bookingId: string }) => period.bookingId).sort();
}

async function listedIds(app: App, roomId: string): Promise<string[]> {
  const response = await request(app).get('/api/bookings').query({ roomId, from: date, to: date }).expect(200);
  return response.body.occurrences.map((occurrence: { bookingId: string }) => occurrence.bookingId).sort();
}

describe('partitioned room booking rules', () => {
  it.each(halves)('a whole-room booking blocks %s', async (half) => {
    const { first, second } = replicas();
    const existing = await book(first, meeting(whole)).expect(201);
    const conflict = await book(second, meeting(half)).expect(409);
    expect(conflict.body.error).toMatchObject({ code: 'CONFLICT', details: [{ bookingId: existing.body.id }] });
  });

  it.each(halves)('a booking in %s blocks the whole room', async (half) => {
    const { first, second } = replicas();
    const existing = await book(first, meeting(half)).expect(201);
    const conflict = await book(second, meeting(whole)).expect(409);
    expect(conflict.body.error).toMatchObject({ code: 'CONFLICT', details: [{ bookingId: existing.body.id }] });
  });

  it('allows both halves to be booked at the same time across applications', async () => {
    const { first, second, db } = replicas();
    const responses = await Promise.all([book(first, meeting(halves[0])), book(second, meeting(halves[1]))]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses.map((response) => response.body.roomId)).toEqual(halves);
    expect(await db.query((tables) => tables.bookings.size)).toBe(2);
  });

  it('confirms only one concurrent whole-versus-half request across isolated app modules', async () => {
    const { first, db } = replicas();
    vi.resetModules();
    const { createApp: createIsolatedApp } = await import('../../src/app');
    const second = createIsolatedApp({ db });
    const responses = await Promise.all([book(first, meeting(whole)), book(second, meeting(halves[0]))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses.find((response) => response.status === 201)!.body;
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.error).toMatchObject({ code: 'CONFLICT', details: [{ bookingId: winner.id }] });
    expect(await db.query((tables) => tables.bookings.size)).toBe(1);
  });

  it.each([
    [whole, halves[0]],
    [halves[1], whole],
  ])('allows back-to-back bookings from %s to %s', async (earlier, later) => {
    const { first, second } = replicas();
    await book(first, meeting(earlier, '13:00', '14:00')).expect(201);
    const next = await book(second, meeting(later, '14:00', '15:00')).expect(201);
    expect(next.body).toMatchObject({ start: `${date}T14:00`, end: `${date}T15:00`, roomId: later });
  });

  it('checks a whole-room series against a half on its ninth occurrence', async () => {
    const { first, second } = replicas();
    const series = await book(first, {
      ...meeting(whole),
      recurrence: { freq: 'WEEKLY', count: 12 },
    }).expect(201);
    const conflict = await book(second, booking(halves[0], '2026-12-29T13:30', '2026-12-29T14:30')).expect(409);
    expect(conflict.body.error.details).toEqual([
      expect.objectContaining({ bookingId: series.body.id, start: '2026-12-29T13:00', end: '2026-12-29T14:00' }),
    ]);
  });

  it('cancelling the whole-room booking frees both halves and retains its audit record', async () => {
    const { first, second } = replicas();
    const original = await book(first, meeting(whole)).expect(201);
    await request(second).delete(`/api/bookings/${original.body.id}`).expect(204);
    const responses = await Promise.all([book(first, meeting(halves[0])), book(second, meeting(halves[1]))]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const history = await request(first).get(`/api/bookings/${original.body.id}`).expect(200);
    expect(history.body).toMatchObject({ id: original.body.id, roomId: whole, status: 'cancelled', cancelledAt: expect.any(String) });
    expect(await busyIds(first, whole)).toEqual(responses.map((response) => response.body.id).sort());
  });
});

describe('partitioned room calendar and cache behavior', () => {
  it('shows whole-room and both half bookings in whole-room availability and occurrence listings', async () => {
    const { first, second } = replicas();
    const parent = await book(first, meeting(whole, '09:00', '10:00')).expect(201);
    const left = await book(first, meeting(halves[0], '11:00', '12:00')).expect(201);
    const right = await book(first, meeting(halves[1], '11:00', '12:00')).expect(201);
    const expected = [parent.body.id, left.body.id, right.body.id].sort();
    expect(await busyIds(second, whole)).toEqual(expected);
    expect(await listedIds(second, whole)).toEqual(expected);
  });

  it.each(halves)('shows the parent and itself, but excludes the sibling, for %s', async (half) => {
    const { first, second } = replicas();
    const sibling = halves.find((roomId) => roomId !== half)!;
    const parent = await book(first, meeting(whole, '09:00', '10:00')).expect(201);
    const own = await book(first, meeting(half, '11:00', '12:00')).expect(201);
    await book(first, meeting(sibling, '11:00', '12:00')).expect(201);
    const expected = [parent.body.id, own.body.id].sort();
    expect(await busyIds(second, half)).toEqual(expected);
    expect(await listedIds(second, half)).toEqual(expected);
  });

  it('refreshes warmed half caches after whole-room create and cancellation on an isolated replica', async () => {
    const { first, db } = replicas();
    vi.resetModules();
    const { createApp: createIsolatedApp } = await import('../../src/app');
    const second = createIsolatedApp({ db });
    for (const half of halves) expect(await busyIds(first, half)).toEqual([]);
    const created = await book(second, meeting(whole)).expect(201);
    for (const half of halves) expect(await busyIds(first, half)).toEqual([created.body.id]);
    await request(second).delete(`/api/bookings/${created.body.id}`).expect(204);
    for (const half of halves) expect(await busyIds(first, half)).toEqual([]);
  });

  it('refreshes a warmed whole-room cache after half create and cancellation on another application', async () => {
    const { first, second } = replicas();
    expect(await busyIds(first, whole)).toEqual([]);
    const created = await book(second, meeting(halves[0])).expect(201);
    expect(await busyIds(first, whole)).toEqual([created.body.id]);
    expect(await busyIds(first, halves[1])).toEqual([]);
    await request(second).delete(`/api/bookings/${created.body.id}`).expect(204);
    expect(await busyIds(first, whole)).toEqual([]);
    expect(await busyIds(first, halves[1])).toEqual([]);
  });
});
