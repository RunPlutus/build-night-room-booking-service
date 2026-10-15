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
    const laterRes = await availability(app, 'rm-fuji', '2026-10-20');
    expect(laterRes.body.busy.map((b: any) => b.title)).toContain('Platform standup');
  });

  it('shows bookings made under a renamed room id', async () => {
    const res = await availability(app, 'rm-olympus', '2026-09-03');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Design review');
    const everestRes = await availability(app, 'rm-everest', '2026-11-02');
    expect(everestRes.body.busy.map((b: any) => b.title)).toContain('Monday all-hands');
  });

  it('excludes cancelled bookings from availability while keeping confirmed bookings', async () => {
    const res = await availability(app, 'rm-kilimanjaro', '2026-10-09');
    const titles = res.body.busy.map((b: any) => b.title);
    expect(titles).toContain('Vendor review');
    expect(titles).not.toContain('Quarterly planning');
  });

  it('updates availability across replicas on create and cancel while preserving audit record', async () => {
    const { createDatabase } = await import('../../src/db');
    const { createApp } = await import('../../src/app');
    const db = createDatabase();
    const appA = createApp({ db });
    const appB = createApp({ db });

    const initialB = await availability(appB, 'rm-kilimanjaro', '2026-11-10');
    expect(initialB.body.busy).toEqual([]);

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
