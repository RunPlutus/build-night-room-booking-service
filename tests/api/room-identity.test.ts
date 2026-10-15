import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book, availability } from '../helpers/app';

// The all-hands series is checked on its first date so the result does not depend on series expansion.
const DAY = '2026-03-02';

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('4B -> Everest rename (FAC-88)', () => {
  it('keeps 4B as a retired record that points at Everest', async () => {
    const res = await request(app).get('/api/rooms/rm-4b');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'rm-4b', name: '4B', status: 'retired', replacedBy: 'rm-everest' });

    const active = (await request(app).get('/api/rooms')).body.rooms.map((r: { id: string }) => r.id);
    expect(active).toContain('rm-everest');
    expect(active).not.toContain('rm-4b');
    const all = (await request(app).get('/api/rooms').query({ includeRetired: 'true' })).body.rooms.map((r: { id: string }) => r.id);
    expect(all).toContain('rm-4b');
  });

  it('keeps the historical all-hands booking under its original 4B id', async () => {
    const res = await request(app).get('/api/bookings/bk_allhands');
    expect(res.body).toMatchObject({
      id: 'bk_allhands',
      roomId: 'rm-4b',
      title: 'Monday all-hands',
      start: '2026-03-02T10:00',
      end: '2026-03-02T11:00',
      recurrence: { freq: 'WEEKLY', until: '2027-03-01' },
      status: 'confirmed',
    });
  });

  it('rejects an Everest booking that overlaps the historical 4B all-hands', async () => {
    const res = await book(app, booking('rm-everest', `${DAY}T10:15`, `${DAY}T10:45`, { title: 'Sales sync' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.map((d: { bookingId: string }) => d.bookingId)).toContain('bk_allhands');
  });

  it('shows the historical 4B all-hands on the Everest calendar', async () => {
    const res = await availability(app, 'rm-everest', DAY);
    expect(res.status).toBe(200);
    expect(res.body.busy.map((b: { title: string }) => b.title)).toContain('Monday all-hands');
  });

  it('refuses direct bookings in the retired 4B record', async () => {
    const res = await book(app, booking('rm-4b', '2027-04-07T10:00', '2027-04-07T11:00'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROOM_RETIRED');
  });

  it('leaves an unrelated room on the same floor independent', async () => {
    expect((await book(app, booking('rm-aconcagua', `${DAY}T10:15`, `${DAY}T10:45`))).status).toBe(201);
    const res = await availability(app, 'rm-aconcagua', DAY);
    expect(res.body.busy.map((b: { title: string }) => b.title)).not.toContain('Monday all-hands');
  });

  it('keeps the supplied Summit halves exactly as released', () => {
    const rooms = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/rooms.json'), 'utf8')).rooms;
    expect(rooms.filter((r: { id: string }) => r.id === 'rm-summit-a')).toEqual([
      { id: 'rm-summit-a', name: 'Summit A', floor: 6, capacity: 14, features: ['display'], status: 'active', parentId: 'rm-summit', createdAt: '2026-10-19T00:00:00.000Z' },
    ]);
    expect(rooms.filter((r: { id: string }) => r.id === 'rm-summit-b')).toEqual([
      { id: 'rm-summit-b', name: 'Summit B', floor: 6, capacity: 14, features: ['display', 'vc'], status: 'active', parentId: 'rm-summit', createdAt: '2026-10-19T00:00:00.000Z' },
    ]);
  });
});
