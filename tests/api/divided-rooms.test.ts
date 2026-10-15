import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book, availability } from '../helpers/app';
import { createApp } from '../../src/app';
import { createDatabase } from '../../src/db';

const DAY = '2026-11-12';
const at = (roomId: string, start: string, end: string, title: string) => booking(roomId, `${DAY}T${start}`, `${DAY}T${end}`, { title });

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('Summit divider: whole room versus halves', () => {
  it('rejects a half while the whole room is booked', async () => {
    await book(app, at('rm-summit', '10:00', '11:00', 'All-hands rehearsal')).expect(201);
    const res = await book(app, at('rm-summit-a', '10:30', '11:30', 'Workshop A'));
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([expect.objectContaining({ title: 'All-hands rehearsal', start: `${DAY}T10:00`, end: `${DAY}T11:00` })]);
  });

  it('rejects the whole room while either half is booked', async () => {
    await book(app, at('rm-summit-b', '11:00', '12:00', 'Workshop B')).expect(201);
    const res = await book(app, at('rm-summit', '11:30', '12:30', 'Town hall'));
    expect(res.status).toBe(409);
    expect(res.body.error.details.map((d: any) => d.title)).toEqual(['Workshop B']);
  });

  it('lets both halves be booked at the same time by different people', async () => {
    const a = await book(app, { ...at('rm-summit-a', '11:00', '12:00', 'Workshop A'), organizer: 'anna@example.com' });
    const b = await book(app, { ...at('rm-summit-b', '11:00', '12:00', 'Workshop B'), organizer: 'ben@example.com' });
    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it('allows a half back-to-back with the whole room', async () => {
    await book(app, at('rm-summit', '10:00', '11:00', 'All-hands rehearsal')).expect(201);
    await book(app, at('rm-summit-a', '11:00', '12:00', 'Workshop A')).expect(201);
  });

  it('blocks the whole room on every occurrence of a recurring half booking', async () => {
    await book(app, { ...at('rm-summit-a', '09:00', '09:30', 'Weekly sync'), recurrence: { freq: 'WEEKLY', count: 4 } }).expect(201);
    const res = await book(app, booking('rm-summit', '2026-11-26T09:00', '2026-11-26T10:00', { title: 'Town hall' }));
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([expect.objectContaining({ title: 'Weekly sync', start: '2026-11-26T09:00' })]);
  });

  it('frees both halves when the whole-room booking is cancelled', async () => {
    const whole = await book(app, at('rm-summit', '10:00', '11:00', 'All-hands rehearsal')).expect(201);
    await request(app).delete(`/api/bookings/${whole.body.id}`).expect(204);
    await book(app, at('rm-summit-a', '10:00', '11:00', 'Workshop A')).expect(201);
    await book(app, at('rm-summit-b', '10:00', '11:00', 'Workshop B')).expect(201);
  });

  it('leaves an unrelated room on the same floor independent', async () => {
    await book(app, at('rm-summit', '10:00', '11:00', 'All-hands rehearsal')).expect(201);
    await book(app, at('rm-hood', '10:00', '11:00', 'Unrelated')).expect(201);
  });
});

describe('Summit divider: calendar', () => {
  it('shows half bookings as busy on the whole-room calendar, and the whole room as busy on each half', async () => {
    await book(app, at('rm-summit-a', '09:00', '10:00', 'Workshop A')).expect(201);
    await book(app, at('rm-summit', '13:00', '14:00', 'Town hall')).expect(201);
    const whole = await availability(app, 'rm-summit', DAY);
    expect(whole.body.roomId).toBe('rm-summit');
    expect(whole.body.busy.map((b: any) => b.title)).toEqual(['Workshop A', 'Town hall']);
    const halfA = await availability(app, 'rm-summit-a', DAY);
    expect(halfA.body.busy.map((b: any) => b.title)).toEqual(['Workshop A', 'Town hall']);
    const halfB = await availability(app, 'rm-summit-b', DAY);
    expect(halfB.body.busy.map((b: any) => b.title)).toEqual(['Town hall']);
  });

  it('refreshes the whole-room calendar after a half is booked on another server', async () => {
    const db = createDatabase();
    const serverA = createApp({ db });
    const serverB = createApp({ db });
    const before = await availability(serverB, 'rm-summit', DAY);
    expect(before.body.busy).toEqual([]);
    await book(serverA, at('rm-summit-b', '14:00', '15:00', 'Half-room interview')).expect(201);
    const after = await availability(serverB, 'rm-summit', DAY);
    expect(after.body.busy.map((b: any) => b.title)).toEqual(['Half-room interview']);
  });

  it('lists only the room’s own occurrences, not those of its halves', async () => {
    await book(app, at('rm-summit-a', '09:00', '10:00', 'Workshop A')).expect(201);
    await book(app, at('rm-summit', '13:00', '14:00', 'Town hall')).expect(201);
    const res = await request(app).get('/api/bookings').query({ roomId: 'rm-summit', from: DAY, to: DAY });
    expect(res.body.occurrences.map((o: any) => o.title)).toEqual(['Town hall']);
  });
});

describe('Summit divider: simultaneous requests across server instances', () => {
  it('confirms only one of a whole-room and a half-room request for the same slot', async () => {
    const db = createDatabase();
    const serverA = createApp({ db });
    const serverB = createApp({ db });
    const results = await Promise.all([
      book(serverA, at('rm-summit', '14:00', '15:00', 'Whole-room offsite')),
      book(serverB, at('rm-summit-b', '14:00', '15:00', 'Half-room interview')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});
