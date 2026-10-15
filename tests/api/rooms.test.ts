import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book, availability } from '../helpers/app';
import { createApp } from '../../src/app';
import { createDatabase, Database } from '../../src/db';
import { metrics } from '../../src/metrics/registry';

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('rooms', () => {
  it('lists active rooms', async () => {
    const res = await request(app).get('/api/rooms');
    const ids = res.body.rooms.map((r: any) => r.id);
    expect(ids).toContain('rm-fuji');
    expect(ids).not.toContain('rm-atlas');
  });

  it('can include retired rooms', async () => {
    const res = await request(app).get('/api/rooms').query({ includeRetired: 'true' });
    expect(res.body.rooms.map((r: any) => r.id)).toContain('rm-atlas');
  });

  it('gets one room', async () => {
    const res = await request(app).get('/api/rooms/rm-summit');
    expect(res.body.capacity).toBe(30);
  });
});

describe('availability', () => {
  it('shows a new booking', async () => {
    await book(app, booking('rm-rainier', '2026-11-03T10:00', '2026-11-03T11:00', { title: 'Planning' }));
    const res = await availability(app, 'rm-rainier', '2026-11-03');
    expect(res.body.busy).toEqual([expect.objectContaining({ title: 'Planning', start: '2026-11-03T10:00', end: '2026-11-03T11:00' })]);
  });

  it('refreshes after a new booking (cache invalidation)', async () => {
    await book(app, booking('rm-rainier', '2026-11-03T10:00', '2026-11-03T11:00'));
    await availability(app, 'rm-rainier', '2026-11-03');
    await book(app, booking('rm-rainier', '2026-11-03T13:00', '2026-11-03T14:00'));
    const res = await availability(app, 'rm-rainier', '2026-11-03');
    expect(res.body.busy).toHaveLength(2);
  });

  it('shows recurring meetings', async () => {
    const res = await availability(app, 'rm-fuji', '2026-07-14');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Platform standup');
  });

  it('shows a weekly meeting months after its series started', async () => {
    const res = await availability(app, 'rm-fuji', '2026-10-20');
    expect(res.body.busy).toContainEqual(expect.objectContaining({ title: 'Platform standup', start: '2026-10-20T09:30', end: '2026-10-20T09:45' }));
  });

  it('shows the 4B all-hands on the Everest calendar after the rename', async () => {
    const res = await availability(app, 'rm-everest', '2026-11-02');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Monday all-hands');
  });

  it('shows bookings made under a renamed room id', async () => {
    const res = await availability(app, 'rm-olympus', '2026-09-03');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Design review');
  });

  it('validates the date', async () => {
    await availability(app, 'rm-fuji', 'tomorrow').expect(400);
  });
});

describe('misc routes', () => {
  it('health', async () => {
    await request(app).get('/health').expect(200);
  });
  it('v1 is gone', async () => {
    const res = await request(app).get('/api/v1/book');
    expect(res.status).toBe(410);
  });
  it('404 for unknown routes', async () => {
    await request(app).get('/nope').expect(404);
  });
});

describe('availability across server instances sharing one database', () => {
  let db: Database;
  let serverA: App;
  let serverB: App;
  beforeEach(() => {
    db = createDatabase();
    serverA = createApp({ db });
    serverB = createApp({ db });
  });

  it('shows a booking created on another server after that create completed', async () => {
    const before = await availability(serverB, 'rm-kilimanjaro', '2026-11-06');
    expect(before.body.busy).toEqual([]);
    await book(serverA, booking('rm-kilimanjaro', '2026-11-06T13:00', '2026-11-06T17:00', { title: 'Quarterly planning' }));
    const after = await availability(serverB, 'rm-kilimanjaro', '2026-11-06');
    expect(after.body.busy.map((b: any) => b.title)).toEqual(['Quarterly planning']);
  });

  it('hides a booking cancelled on another server after that cancellation completed', async () => {
    const created = await book(serverA, booking('rm-kilimanjaro', '2026-11-06T13:00', '2026-11-06T17:00', { title: 'Quarterly planning' }));
    await availability(serverA, 'rm-kilimanjaro', '2026-11-06');
    await availability(serverB, 'rm-kilimanjaro', '2026-11-06');
    await request(serverA).delete(`/api/bookings/${created.body.id}`).expect(204);
    const onA = await availability(serverA, 'rm-kilimanjaro', '2026-11-06');
    const onB = await availability(serverB, 'rm-kilimanjaro', '2026-11-06');
    expect(onA.body.busy).toEqual([]);
    expect(onB.body.busy).toEqual([]);
  });

  it('keeps the cancelled booking available for audit', async () => {
    const created = await book(serverA, booking('rm-kilimanjaro', '2026-11-06T13:00', '2026-11-06T17:00'));
    await request(serverA).delete(`/api/bookings/${created.body.id}`).expect(204);
    const res = await request(serverB).get(`/api/bookings/${created.body.id}`).expect(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('reuses the cached day for repeated unchanged reads', async () => {
    await book(serverA, booking('rm-kilimanjaro', '2026-11-06T13:00', '2026-11-06T17:00'));
    const hitsBefore = Number(metrics.snapshot().availability_cache_hit ?? 0);
    await availability(serverA, 'rm-kilimanjaro', '2026-11-06');
    await availability(serverA, 'rm-kilimanjaro', '2026-11-06');
    await availability(serverA, 'rm-kilimanjaro', '2026-11-06');
    expect(Number(metrics.snapshot().availability_cache_hit ?? 0)).toBe(hitsBefore + 2);
  });
});
