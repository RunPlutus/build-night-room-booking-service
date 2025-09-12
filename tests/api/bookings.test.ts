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

  it('allows the same time in a different room', async () => {
    await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    const res = await book(app, booking('rm-rainier', '2026-11-03T14:00', '2026-11-03T15:00'));
    expect(res.status).toBe(201);
  });

  it('detects a clash with a seeded recurring meeting (Platform standup, week 2)', async () => {
    const res = await book(app, booking('rm-fuji', '2026-07-14T09:30', '2026-07-14T10:00'));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].title).toBe('Platform standup');
  });

  it('detects a clash between a new weekly series and an existing one-off', async () => {
    await book(app, booking('rm-rainier', '2026-11-19T11:00', '2026-11-19T12:00', { title: 'Offsite debrief' }));
    const res = await book(
      app,
      booking('rm-rainier', '2026-11-05T11:00', '2026-11-05T11:30', { recurrence: { freq: 'WEEKLY', count: 10 } }),
    );
    expect(res.status).toBe(409);
  });

  it('treats a renamed room as the same physical room (Atlas -> Olympus)', async () => {
    const res = await book(app, booking('rm-olympus', '2026-09-10T14:30', '2026-09-10T15:00'));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].title).toBe('Design review');
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

  it('frees the slot for new bookings after cancelling', async () => {
    const created = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    await request(app).delete(`/api/bookings/${created.body.id}`);
    const res = await book(app, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
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
  it('lists occurrences of recurring meetings in range', async () => {
    const res = await request(app).get('/api/bookings').query({ roomId: 'rm-fuji', from: '2026-07-06', to: '2026-07-19' });
    const standups = res.body.occurrences.filter((o: any) => o.title === 'Platform standup');
    expect(standups.map((o: any) => o.start)).toEqual(['2026-07-07T09:30', '2026-07-14T09:30']);
  });

  it('requires roomId/from/to', async () => {
    await request(app).get('/api/bookings').expect(400);
  });
});
