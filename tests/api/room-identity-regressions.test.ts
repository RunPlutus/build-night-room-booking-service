import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { App, availability, book, booking, freshApp } from '../helpers/app';

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('4B -> Everest room identity', () => {
  it('offers Everest for new bookings and retains the retired 4B reference', async () => {
    const active = await request(app).get('/api/rooms').expect(200);
    expect(active.body.rooms.map((room: { id: string }) => room.id)).toContain('rm-everest');
    expect(active.body.rooms.map((room: { id: string }) => room.id)).not.toContain('rm-4b');

    const old = await request(app).get('/api/rooms/rm-4b').expect(200);
    expect(old.body).toMatchObject({ id: 'rm-4b', name: '4B', status: 'retired', replacedBy: 'rm-everest' });
    const all = await request(app).get('/api/rooms').query({ includeRetired: 'true' }).expect(200);
    expect(all.body.rooms.map((room: { id: string }) => room.id)).toContain('rm-4b');
  });

  it('shows historical bookings through both room references', async () => {
    for (const roomId of ['rm-everest', 'rm-4b']) {
      const res = await availability(app, roomId, '2026-03-02').expect(200);
      expect(res.body.roomId).toBe(roomId);
      expect(res.body.busy).toEqual([
        { bookingId: 'bk_allhands', title: 'Monday all-hands', start: '2026-03-02T10:00', end: '2026-03-02T11:00' },
      ]);
    }
  });

  it('rejects an Everest booking that overlaps a booking stored under 4B', async () => {
    const res = await book(app, booking('rm-everest', '2026-03-02T10:15', '2026-03-02T10:45')).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details).toEqual([
      { bookingId: 'bk_allhands', title: 'Monday all-hands', start: '2026-03-02T10:00', end: '2026-03-02T11:00' },
    ]);
  });

  it('rejects new bookings addressed to retired 4B', async () => {
    const res = await book(app, booking('rm-4b', '2026-03-03T10:00', '2026-03-03T11:00')).expect(400);
    expect(res.body.error.code).toBe('ROOM_RETIRED');
  });

  it('shows a new Everest booking through the old and current references', async () => {
    const created = await book(app, booking('rm-everest', '2026-03-03T10:00', '2026-03-03T11:00')).expect(201);
    for (const roomId of ['rm-4b', 'rm-everest']) {
      const res = await availability(app, roomId, '2026-03-03').expect(200);
      expect(res.body.roomId).toBe(roomId);
      expect(res.body.busy).toEqual([
        { bookingId: created.body.id, title: 'Test meeting', start: '2026-03-03T10:00', end: '2026-03-03T11:00' },
      ]);
    }
  });

  it('keeps an unrelated room independently bookable at the same time', async () => {
    const created = await book(app, booking('rm-aconcagua', '2026-03-02T10:15', '2026-03-02T10:45')).expect(201);
    const res = await availability(app, 'rm-aconcagua', '2026-03-02').expect(200);
    expect(res.body.busy.map((period: { bookingId: string }) => period.bookingId)).toEqual([created.body.id]);
  });

  it('preserves the historical booking identity in lookups and occurrence listings', async () => {
    const historical = await request(app).get('/api/bookings/bk_allhands').expect(200);
    expect(historical.body).toEqual({
      id: 'bk_allhands',
      roomId: 'rm-4b',
      title: 'Monday all-hands',
      organizer: 'ceo-office@example.com',
      start: '2026-03-02T10:00',
      end: '2026-03-02T11:00',
      recurrence: { freq: 'WEEKLY', until: '2027-03-01' },
      status: 'confirmed',
      createdAt: '2026-02-20T17:03:11.000Z',
    });
    for (const roomId of ['rm-4b', 'rm-everest']) {
      const res = await request(app).get('/api/bookings')
        .query({ roomId, from: '2026-03-02', to: '2026-03-02' }).expect(200);
      expect(res.body.occurrences).toEqual([
        {
          bookingId: 'bk_allhands', roomId: 'rm-4b', title: 'Monday all-hands', organizer: 'ceo-office@example.com',
          start: '2026-03-02T10:00', end: '2026-03-02T11:00', status: 'confirmed',
        },
      ]);
    }
  });
});
