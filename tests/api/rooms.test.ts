import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book, availability } from '../helpers/app';

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
    const oct6Res = await availability(app, 'rm-fuji', '2026-10-06');
    expect(oct6Res.body.busy.map((b: any) => b.title)).toContain('Platform standup');
    const oct20Res = await availability(app, 'rm-fuji', '2026-10-20');
    expect(oct20Res.body.busy.map((b: any) => b.title)).toContain('Platform standup');
  });

  it('shows bookings made under a renamed room id', async () => {
    const res = await availability(app, 'rm-olympus', '2026-09-03');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Design review');
    const oct5Everest = await availability(app, 'rm-everest', '2026-10-05');
    expect(oct5Everest.body.busy.map((b: any) => b.title)).toContain('Monday all-hands');
    const nov2Everest = await availability(app, 'rm-everest', '2026-11-02');
    expect(nov2Everest.body.busy.map((b: any) => b.title)).toContain('Monday all-hands');
  });

  it('excludes cancelled bookings from availability while keeping confirmed bookings', async () => {
    const res = await availability(app, 'rm-kilimanjaro', '2026-10-09');
    const titles = res.body.busy.map((b: any) => b.title);
    expect(titles).toContain('Vendor review');
    expect(titles).not.toContain('Quarterly planning');
  });

  it('updates availability across replicas on create, cancel, and re-book while preserving cache hits and audit record', async () => {
    const { createDatabase } = await import('../../src/db');
    const { createApp } = await import('../../src/app');
    const { metrics } = await import('../../src/metrics/registry');
    const db = createDatabase();
    const appA = createApp({ db });
    const appB = createApp({ db });

    metrics.reset();
    const initialB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(initialB.body.busy).toEqual([]);
    expect(metrics.snapshot().availability_cache_miss).toBe(1);

    // Repeated unchanged read on server B hits the cache without recomputing
    const cachedB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(cachedB.body.busy).toEqual([]);
    expect(metrics.snapshot().availability_cache_hit).toBe(1);
    expect(metrics.snapshot().availability_cache_miss).toBe(1);

    const created = await book(appA, booking('rm-kilimanjaro', '2026-11-10T13:00', '2026-11-10T17:00', { title: 'Quarterly planning' }));
    expect(created.status).toBe(201);

    const afterCreateA = await availability(appA, 'rm-kilimanjaro', '2026-11-10');
    const afterCreateB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(afterCreateA.body.busy.map((b: any) => b.title)).toEqual(['Quarterly planning']);
    expect(afterCreateB.body.busy.map((b: any) => b.title)).toEqual(['Quarterly planning']);

    await request(appA).delete(`/api/bookings/${created.body.id}`).expect(204);

    const auditRes = await request(appB).get(`/api/bookings/${created.body.id}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.status).toBe('cancelled');

    const afterCancelA = await availability(appA, 'rm-kilimanjaro', '2026-11-10');
    const afterCancelB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(afterCancelA.body.busy).toEqual([]);
    expect(afterCancelB.body.busy).toEqual([]);

    // Re-booking the released slot on server B invalidates server A's cached empty state
    const rebooked = await book(appB, booking('rm-kilimanjaro', '2026-11-10T13:00', '2026-11-10T17:00', { title: 'Team workshop' }));
    expect(rebooked.status).toBe(201);

    const afterRebookA = await availability(appA, 'rm-kilimanjaro', '2026-11-10');
    const afterRebookB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(afterRebookA.body.busy.map((b: any) => b.title)).toEqual(['Team workshop']);
    expect(afterRebookB.body.busy.map((b: any) => b.title)).toEqual(['Team workshop']);
  });

  it('reflects availability across parent and divided room halves', async () => {
    // Prime caches for Summit, Summit A, and Summit B
    expect((await availability(app, 'rm-summit', '2026-11-12')).body.busy).toEqual([]);
    expect((await availability(app, 'rm-summit-a', '2026-11-12')).body.busy).toEqual([]);
    expect((await availability(app, 'rm-summit-b', '2026-11-12')).body.busy).toEqual([]);

    // Booking Summit A marks Summit A and whole Summit busy, while Summit B stays free
    const halfA = await book(app, booking('rm-summit-a', '2026-11-12T11:00', '2026-11-12T12:00', { title: 'Workshop A' }));
    expect(halfA.status).toBe(201);
    expect((await availability(app, 'rm-summit', '2026-11-12')).body.busy.map((b: any) => b.title)).toEqual(['Workshop A']);
    expect((await availability(app, 'rm-summit-a', '2026-11-12')).body.busy.map((b: any) => b.title)).toEqual(['Workshop A']);
    expect((await availability(app, 'rm-summit-b', '2026-11-12')).body.busy).toEqual([]);

    // Cancelling Summit A frees both Summit A and whole Summit
    await request(app).delete(`/api/bookings/${halfA.body.id}`).expect(204);
    expect((await availability(app, 'rm-summit', '2026-11-12')).body.busy).toEqual([]);
    expect((await availability(app, 'rm-summit-a', '2026-11-12')).body.busy).toEqual([]);
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
