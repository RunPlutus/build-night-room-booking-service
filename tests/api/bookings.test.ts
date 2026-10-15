import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book } from '../helpers/app';

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('POST /api/bookings', () => {
  it('creates a booking', async () => {
    const res = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ roomId: 'rm-fuji', start: '2026-11-03T14:00', end: '2026-11-03T15:00', status: 'confirmed' });
    expect(res.headers.location).toBe(`/api/bookings/${res.body.id}`);
  });

  it('rejects an overlapping booking with 409 and lists the conflict', async () => {
    await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00', { title: 'Design sync' }));
    const res = await book(app, booking('rm-fuji', '2026-11-03T14:30', '2026-11-03T15:30'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details[0]).toMatchObject({ title: 'Design sync', start: '2026-11-03T14:00' });
  });

  it('rejects a booking fully inside another', async () => {
    await book(app, booking('rm-fuji', '2026-11-03T13:00', '2026-11-03T16:00'));
    const res = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T14:30'));
    expect(res.status).toBe(409);
  });

  it('allows bookings with a gap between them', async () => {
    await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    const res = await book(app, booking('rm-fuji', '2026-11-03T15:30', '2026-11-03T16:00'));
    expect(res.status).toBe(201);
  });

  it('allows back-to-back bookings without modifying endpoints', async () => {
    const first = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00', { title: '1:1 Sam / Alex' }));
    expect(first.status).toBe(201);
    const second = await book(app, booking('rm-fuji', '2026-11-03T15:00', '2026-11-03T16:00', { title: 'Design sync' }));
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ start: '2026-11-03T15:00', end: '2026-11-03T16:00' });
  });

  it('allows the same time in a different room', async () => {
    await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    const res = await book(app, booking('rm-rainier', '2026-11-03T14:00', '2026-11-03T15:00'));
    expect(res.status).toBe(201);
  });

  it('detects a clash with a seeded recurring meeting (Platform standup, week 2 and later weeks)', async () => {
    const res = await book(app, booking('rm-fuji', '2026-07-14T09:30', '2026-07-14T10:00'));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].title).toBe('Platform standup');

    const oct6Res = await book(app, booking('rm-fuji', '2026-10-06T09:30', '2026-10-06T10:00'));
    expect(oct6Res.status).toBe(409);
    expect(oct6Res.body.error.details[0].title).toBe('Platform standup');

    const oct20Res = await book(app, booking('rm-fuji', '2026-10-20T09:30', '2026-10-20T10:00'));
    expect(oct20Res.status).toBe(409);
    expect(oct20Res.body.error.details[0].title).toBe('Platform standup');
  });

  it('detects a clash between a new weekly series and an existing one-off (including week 10)', async () => {
    await book(app, booking('rm-rainier', '2027-01-07T11:00', '2027-01-07T12:00', { title: 'Offsite debrief' }));
    const res = await book(
      app,
      booking('rm-rainier', '2026-11-05T11:00', '2026-11-05T11:30', { recurrence: { freq: 'WEEKLY', count: 10 } }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].title).toBe('Offsite debrief');
  });

  it('treats a renamed room as the same physical room (Atlas -> Olympus)', async () => {
    const res = await book(app, booking('rm-olympus', '2026-09-10T14:30', '2026-09-10T15:00'));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].title).toBe('Design review');
  });

  it('treats 4B -> Everest as the same physical room and refuses direct bookings in retired 4B', async () => {
    const retiredRes = await book(app, booking('rm-4b', '2026-11-03T10:00', '2026-11-03T11:00'));
    expect(retiredRes.status).toBe(400);
    expect(retiredRes.body.error.code).toBe('ROOM_RETIRED');

    const oct5Conflict = await book(app, booking('rm-everest', '2026-10-05T10:00', '2026-10-05T11:00'));
    expect(oct5Conflict.status).toBe(409);
    expect(oct5Conflict.body.error.details[0].title).toBe('Monday all-hands');

    const nov2Conflict = await book(app, booking('rm-everest', '2026-11-02T10:00', '2026-11-02T11:00'));
    expect(nov2Conflict.status).toBe(409);
    expect(nov2Conflict.body.error.details[0].title).toBe('Monday all-hands');
  });

  it('allows only one booking when concurrent requests for the same slot arrive across replicas', async () => {
    const { createDatabase } = await import('../../src/db');
    const { createApp } = await import('../../src/app');
    const db = createDatabase();
    const appA = createApp({ db });
    const appB = createApp({ db });

    const results = await Promise.all([
      book(appA, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: 'Customer call' })),
      book(appB, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: 'Interview loop' })),
      book(appA, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: 'Team sync' })),
      book(appB, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: 'Hiring debrief' })),
    ]);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);

    const listRes = await request(appA).get('/api/bookings').query({ roomId: 'rm-rainier', from: '2026-11-05', to: '2026-11-05' });
    const confirmed = listRes.body.occurrences.filter((o: any) => o.status === 'confirmed' && o.start === '2026-11-05T13:00');
    expect(confirmed).toHaveLength(1);
  });

  it('refuses bookings in a retired room', async () => {
    const res = await book(app, booking('rm-atlas', '2026-11-03T10:00', '2026-11-03T11:00'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROOM_RETIRED');
  });

  it('404s an unknown room', async () => {
    const res = await book(app, booking('rm-narnia', '2026-11-03T10:00', '2026-11-03T11:00'));
    expect(res.status).toBe(404);
  });

  it.each([
    ['end before start', { start: '2026-11-03T11:00', end: '2026-11-03T10:00' }],
    ['not on a 15-minute boundary', { start: '2026-11-03T10:10', end: '2026-11-03T11:00' }],
    ['bad date', { start: '2026-02-30T10:00', end: '2026-02-30T11:00' }],
    ['missing organizer', { organizer: '' }],
    ['too long', { start: '2026-11-03T07:00', end: '2026-11-03T18:00' }],
    ['series too long', { recurrence: { freq: 'WEEKLY', count: 60 } }],
    ['recurrence without end', { recurrence: { freq: 'WEEKLY' } }],
  ])('400 when %s', async (_name, patch) => {
    const res = await book(app, { ...booking('rm-fuji', '2026-11-03T10:00', '2026-11-03T11:00'), ...patch });
    expect(res.status).toBe(400);
  });
});

describe('GET / DELETE /api/bookings/:id', () => {
  it('fetches a booking', async () => {
    const created = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    const res = await request(app).get(`/api/bookings/${created.body.id}`);
    expect(res.body.title).toBe('Test meeting');
  });

  it('cancels a booking (soft delete)', async () => {
    const created = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    await request(app).delete(`/api/bookings/${created.body.id}`).expect(204);
    const res = await request(app).get(`/api/bookings/${created.body.id}`);
    expect(res.body.status).toBe('cancelled');
  });

  it('frees the slot for new bookings and updates availability after cancelling', async () => {
    const created = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00', { title: 'Initial booking' }));
    const beforeCancel = await request(app).get('/api/rooms/rm-fuji/availability').query({ date: '2026-11-03' });
    expect(beforeCancel.body.busy.map((b: any) => b.title)).toContain('Initial booking');

    await request(app).delete(`/api/bookings/${created.body.id}`).expect(204);

    const afterCancel = await request(app).get('/api/rooms/rm-fuji/availability').query({ date: '2026-11-03' });
    expect(afterCancel.body.busy.map((b: any) => b.title)).not.toContain('Initial booking');

    const res = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00', { title: 'Replacement booking' }));
    expect(res.status).toBe(201);
  });

  it('cancelling twice is fine', async () => {
    const created = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    await request(app).delete(`/api/bookings/${created.body.id}`).expect(204);
    await request(app).delete(`/api/bookings/${created.body.id}`).expect(204);
  });

  it('404s unknown bookings', async () => {
    await request(app).get('/api/bookings/bk_nope').expect(404);
    await request(app).delete('/api/bookings/bk_nope').expect(404);
  });
});

describe('GET /api/bookings (occurrences)', () => {
  it('lists occurrences of recurring meetings in range including past week 8', async () => {
    const res = await request(app).get('/api/bookings').query({ roomId: 'rm-fuji', from: '2026-07-06', to: '2026-07-19' });
    const standups = res.body.occurrences.filter((o: any) => o.title === 'Platform standup');
    expect(standups.map((o: any) => o.start)).toEqual(['2026-07-07T09:30', '2026-07-14T09:30']);

    const octRes = await request(app).get('/api/bookings').query({ roomId: 'rm-fuji', from: '2026-10-05', to: '2026-10-21' });
    const octStandups = octRes.body.occurrences.filter((o: any) => o.title === 'Platform standup');
    expect(octStandups.map((o: any) => o.start)).toEqual(['2026-10-06T09:30', '2026-10-13T09:30', '2026-10-20T09:30']);
  });

  it('requires roomId/from/to', async () => {
    await request(app).get('/api/bookings').expect(400);
  });
});
