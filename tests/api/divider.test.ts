import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Database } from '../../src/db/Database';
import { loadSeed } from '../../src/db';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { book, booking, availability } from '../helpers/app';

const date = '2026-11-12';
const whole = 'rm-summit';
const a = 'rm-summit-a';
const b = 'rm-summit-b';
const roomIds = [whole, a, b];
let db: Database;
let apps: ReturnType<typeof createApp>[];
const payload = (id: string, start = '10:00', end = '11:00', extra = {}) =>
  booking(id, date + 'T' + start, date + 'T' + end, extra);
beforeEach(() => {
  const rooms = loadSeed().rooms.filter((room) => roomIds.includes(room.id));
  db = new Database({ rooms, bookings: [] }, 0);
  apps = [createApp({ db }), createApp({ db })];
});
afterEach(() => vi.restoreAllMocks());

describe('Summit divider contract', () => {
  it.each([a, b])('a whole-room booking blocks %s with existing conflict detail', async (half) => {
    const created = await book(apps[0], payload(whole)).expect(201);
    const rejected = await book(apps[1], payload(half, '10:15', '10:45')).expect(409);
    expect(rejected.body.error.code).toBe('CONFLICT');
    expect(rejected.body.error.details).toEqual([expect.objectContaining({ bookingId: created.body.id })]);
  });

  it.each([a, b])('%s blocks the whole room but not its sibling', async (half) => {
    await book(apps[0], payload(half)).expect(201);
    await book(apps[1], payload(whole)).expect(409);
    await book(apps[1], payload(half === a ? b : a)).expect(201);
  });

  it('accepts both halves concurrently but rejects overlapping whole-room contenders', async () => {
    const responses = await Promise.all([book(apps[0], payload(a)), book(apps[1], payload(b))]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    await book(apps[0], payload(whole)).expect(409);
    expect(await new BookingRepository(db).count()).toBe(2);
  });

  it.each([a, b])('serializes a whole room versus %s race across apps', async (half) => {
    const results = await Promise.all([book(apps[0], payload(whole)), book(apps[1], payload(half))]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await new BookingRepository(db).count()).toBe(1);
  });

  it.each([[whole, a], [a, whole], [whole, b], [b, whole]])('allows touching endpoints from %s to %s', async (first, second) => {
    await book(apps[0], payload(first)).expect(201);
    await book(apps[1], payload(second, '11:00', '12:00')).expect(201);
  });

  it('shows a whole-room occurrence on both halves with its original room identity', async () => {
    const created = await book(apps[0], payload(whole)).expect(201);
    for (const id of roomIds) {
      const day = await availability(apps[1], id, date).expect(200);
      expect(day.body.roomId).toBe(id);
      expect(day.body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual([created.body.id]);
      const listed = await request(apps[1]).get('/api/bookings').query({ roomId: id, from: date, to: date }).expect(200);
      expect(listed.body.occurrences).toEqual([expect.objectContaining({ bookingId: created.body.id, roomId: whole })]);
    }
  });

  it('shows independent half bookings on the whole calendar without copying them to siblings', async () => {
    const first = await book(apps[0], payload(a)).expect(201);
    const second = await book(apps[1], payload(b)).expect(201);
    const all = await availability(apps[0], whole, date).expect(200);
    expect(all.body.busy.map((row: { bookingId: string }) => row.bookingId).sort()).toEqual([first.body.id, second.body.id].sort());
    for (const [id, bookingId] of [[a, first.body.id], [b, second.body.id]]) {
      const day = await availability(apps[0], id, date).expect(200);
      expect(day.body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual([bookingId]);
    }
  });

  it.each([whole, a, b])('refreshes every affected warm calendar after creating/cancelling %s', async (bookedRoom) => {
    for (const app of apps) for (const id of roomIds) await availability(app, id, date).expect(200);
    const created = await book(apps[0], payload(bookedRoom)).expect(201);
    const affected = bookedRoom === whole ? roomIds : [whole, bookedRoom];
    for (const app of apps) {
      for (const id of roomIds) {
        const day = await availability(app, id, date).expect(200);
        expect(day.body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual(affected.includes(id) ? [created.body.id] : []);
      }
    }
    await request(apps[1]).delete('/api/bookings/' + created.body.id).expect(204);
    await request(apps[0]).delete('/api/bookings/' + created.body.id).expect(204);
    for (const app of [...apps, createApp({ db })]) {
      for (const id of roomIds) expect((await availability(app, id, date).expect(200)).body.busy).toEqual([]);
    }
    expect((await request(apps[0]).get('/api/bookings/' + created.body.id).expect(200)).body).toMatchObject({
      status: 'cancelled', roomId: bookedRoom,
    });
  });

  it('retains an unchanged sibling cache hit after a half changes', async () => {
    const snapshot = vi.spyOn(BookingRepository.prototype, 'snapshotByRooms');
    await availability(apps[1], b, date).expect(200);
    expect(snapshot).toHaveBeenCalledTimes(1);
    await book(apps[0], payload(a)).expect(201);
    await availability(apps[1], b, date).expect(200);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it.each([[whole, a], [a, whole], [whole, b], [b, whole]])('checks late/final recurrence conflicts from %s to %s', async (first, second) => {
    const created = await book(apps[0], payload(first, '10:00', '11:00', { recurrence: { freq: 'DAILY', count: 12 } })).expect(201);
    const rejected = await book(apps[1], booking(second, '2026-11-23T10:15', '2026-11-23T10:45')).expect(409);
    expect(rejected.body.error.details[0]).toMatchObject({ bookingId: created.body.id, start: '2026-11-23T10:00' });
    const day = await availability(apps[1], second, '2026-11-23').expect(200);
    expect(day.body.busy).toContainEqual(expect.objectContaining({ bookingId: created.body.id }));
  });

  it('keeps official half-room metadata and exposes parentId without changing the API envelope', async () => {
    const response = await request(apps[0]).get('/api/rooms').expect(200);
    for (const id of [a, b]) {
      expect(response.body.rooms).toContainEqual(expect.objectContaining({ id, parentId: whole, capacity: 14, status: 'active' }));
    }
  });
});
