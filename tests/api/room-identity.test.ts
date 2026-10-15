import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshApp, booking, book, availability } from '../helpers/app';

describe('4B and Everest refer to one physical room', () => {
  it('lists 4B only when retired rooms are requested and refuses direct bookings', async () => {
    const app = freshApp();
    const active = await request(app).get('/api/rooms').expect(200);
    expect(active.body.rooms.map((r: { id: string }) => r.id)).not.toContain('rm-4b');
    const all = await request(app).get('/api/rooms?includeRetired=true').expect(200);
    expect(all.body.rooms).toContainEqual(expect.objectContaining({
      id: 'rm-4b', status: 'retired', replacedBy: 'rm-everest',
    }));
    const rejected = await book(app, booking('rm-4b', '2026-11-03T10:00', '2026-11-03T11:00'));
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('ROOM_RETIRED');
  });

  it('keeps historical all-hands visible and conflicting through Everest', async () => {
    const app = freshApp();
    const day = await availability(app, 'rm-everest', '2026-03-09').expect(200);
    expect(day.body.busy).toContainEqual(expect.objectContaining({ bookingId: 'bk_allhands' }));
    const conflict = await book(app, booking('rm-everest', '2026-03-09T10:15', '2026-03-09T10:45'));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details).toContainEqual(expect.objectContaining({ bookingId: 'bk_allhands' }));
    const list = await request(app).get('/api/bookings').query({
      roomId: 'rm-everest', from: '2026-03-09', to: '2026-03-09',
    }).expect(200);
    expect(list.body.occurrences).toContainEqual(expect.objectContaining({
      bookingId: 'bk_allhands', roomId: 'rm-4b',
    }));
    const historical = await request(app).get('/api/bookings/bk_allhands').expect(200);
    expect(historical.body.roomId).toBe('rm-4b');
  });
});
