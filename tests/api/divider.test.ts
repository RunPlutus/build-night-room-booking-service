import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase, loadSeed } from '../../src/db';
import { App, availability, book, booking } from '../helpers/app';

const whole = 'rm-summit';
const halfA = 'rm-summit-a';
const halfB = 'rm-summit-b';
const day = '2026-11-02';
const slot = (roomId: string) => booking(roomId, `${day}T10:00`, `${day}T11:00`);

function replicas(): App[] {
  const db = createDatabase();
  return [createApp({ db }), createApp({ db }), createApp({ db })];
}

async function busyIds(app: App, roomId: string): Promise<string[]> {
  const response = await availability(app, roomId, day);
  expect(response.status).toBe(200);
  return response.body.busy.map((entry: { bookingId: string }) => entry.bookingId);
}

describe('Summit movable divider', () => {
  it.each([
    [whole, halfA], [whole, halfB], [halfA, whole], [halfB, whole],
  ])('a booking in %s blocks an overlapping booking in %s', async (first, second) => {
    const [a, b] = replicas();
    const existing = await book(a, slot(first));
    expect(existing.status).toBe(201);
    const conflict = await book(b, slot(second));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details[0].bookingId).toBe(existing.body.id);
  });

  it('allows both halves simultaneously while keeping another room independent', async () => {
    const [a, b, c] = replicas();
    const responses = await Promise.all([
      book(a, slot(halfA)), book(b, slot(halfB)), book(c, slot('rm-hood')),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    expect(await busyIds(a, halfA)).toEqual([responses[0].body.id]);
    expect(await busyIds(b, halfB)).toEqual([responses[1].body.id]);
    expect((await busyIds(c, whole)).sort()).toEqual(responses.slice(0, 2).map((response) => response.body.id).sort());
  });

  it.each([[whole, halfA], [halfB, whole]])('allows a back-to-back booking from %s to %s', async (first, second) => {
    const [a, b] = replicas();
    expect((await book(a, slot(first))).status).toBe(201);
    expect((await book(b, booking(second, `${day}T11:00`, `${day}T12:00`))).status).toBe(201);
  });

  it('checks the final occurrence of a long whole-room series against either half', async () => {
    const [a, b, c] = replicas();
    expect((await book(a, { ...slot(whole), recurrence: { freq: 'DAILY', count: 17 } })).status).toBe(201);
    for (const room of [halfA, halfB]) {
      expect((await book(b, booking(room, '2026-11-18T10:00', '2026-11-18T11:00'))).status).toBe(409);
    }
    expect((await book(c, booking(halfA, '2026-11-19T10:00', '2026-11-19T11:00'))).status).toBe(201);
  });

  it.each([whole, halfA])('refreshes already-open calendars on three replicas after creating and cancelling %s', async (room) => {
    const apps = replicas();
    const rooms = [whole, halfA, halfB];
    for (const app of apps) {
      for (const id of rooms) expect(await busyIds(app, id)).toEqual([]);
    }
    const created = await book(apps[0], slot(room));
    expect(created.status).toBe(201);
    for (const app of apps) {
      for (const id of rooms) {
        expect(await busyIds(app, id)).toEqual(room === halfA && id === halfB ? [] : [created.body.id]);
      }
    }
    expect((await request(apps[2]).delete(`/api/bookings/${created.body.id}`)).status).toBe(204);
    for (const app of apps) {
      for (const id of rooms) expect(await busyIds(app, id)).toEqual([]);
    }
    const audit = await request(apps[1]).get(`/api/bookings/${created.body.id}`);
    expect(audit.body).toMatchObject({ id: created.body.id, roomId: room, status: 'cancelled' });
    expect((await book(apps[1], slot(room === whole ? halfA : whole))).status).toBe(201);
  });

  it.each([halfA, halfB])('accepts only one concurrent whole-room / %s request across replicas', async (half) => {
    const [a, b, c] = replicas();
    const responses = await Promise.all([book(a, slot(whole)), book(b, slot(half))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await busyIds(c, whole)).toEqual([responses.find((response) => response.status === 201)!.body.id]);
  });

  it.each([[whole, halfA], [halfA, whole]])('preserves historic %s aliases when checking %s', async (source, target) => {
    const seed = loadSeed();
    const oldWhole = { ...seed.rooms.find((room) => room.id === whole)!, id: 'rm-summit-old', status: 'retired' as const, replacedBy: whole };
    const oldHalf = { ...seed.rooms.find((room) => room.id === halfA)!, id: 'rm-summit-a-old', status: 'retired' as const, replacedBy: halfA };
    seed.rooms.push(oldWhole, oldHalf);
    seed.rooms = seed.rooms.map((room) => [halfA, halfB].includes(room.id) ? { ...room, parentId: oldWhole.id } : room);
    seed.bookings = [{
      id: 'historic-divider-booking', roomId: source === whole ? oldWhole.id : oldHalf.id,
      title: 'Historic reservation', organizer: 'tester@example.com',
      start: `${day}T10:00`, end: `${day}T11:00`, recurrence: null,
      status: 'confirmed', createdAt: '2026-10-01T00:00:00.000Z',
    }];
    const app = createApp({ db: createDatabase({ seed }) });
    expect((await book(app, slot(target))).status).toBe(409);
    expect(await busyIds(app, target)).toEqual(['historic-divider-booking']);
    expect((await request(app).get('/api/bookings/historic-divider-booking')).body.roomId).toBe(seed.bookings[0].roomId);
  });
});
