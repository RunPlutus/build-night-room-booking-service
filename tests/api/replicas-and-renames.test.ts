import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase } from '../../src/db';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { App, booking, book, availability } from '../helpers/app';

/** Two app instances sharing one database, like production replicas. */
function replicas(): { a: App; b: App } {
  const db = createDatabase();
  return { a: createApp({ db }), b: createApp({ db }) };
}

async function busyTitles(app: App, roomId: string, date: string): Promise<string[]> {
  const res = await availability(app, roomId, date);
  expect(res.status).toBe(200);
  return res.body.busy.map((b: { title: string }) => b.title).sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('simultaneous bookings on different replicas', () => {
  it('confirms exactly one of several requests for the same slot', async () => {
    const { a, b } = replicas();
    const results = await Promise.all(
      [a, b, a, b].map((app, i) => book(app, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: `Request ${i}` }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);

    const list = await request(b).get('/api/bookings').query({ roomId: 'rm-rainier', from: '2026-11-05', to: '2026-11-05' });
    const stored = list.body.occurrences.filter((o: any) => o.status === 'confirmed' && o.start === '2026-11-05T13:00');
    expect(stored).toHaveLength(1);
  });

  it('still confirms simultaneous requests that do not clash', async () => {
    const { a, b } = replicas();
    const results = await Promise.all([
      book(a, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00')),
      book(b, booking('rm-rainier', '2026-11-05T15:00', '2026-11-05T16:00')),
      book(a, booking('rm-denali', '2026-11-05T13:00', '2026-11-05T14:00')),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
  });
});

describe('availability seen from every replica', () => {
  const room = 'rm-kilimanjaro';
  const day = '2026-11-10';

  it('shows a booking made on another replica to a calendar that was already open', async () => {
    const { a, b } = replicas();
    expect(await busyTitles(b, room, day)).toEqual([]);

    const created = await book(a, booking(room, `${day}T13:00`, `${day}T17:00`, { title: 'Quarterly planning' }));
    expect(created.status).toBe(201);

    expect(await busyTitles(a, room, day)).toEqual(['Quarterly planning']);
    expect(await busyTitles(b, room, day)).toEqual(['Quarterly planning']);
  });

  it('frees a cancelled slot on every replica, keeps active bookings and the audit record', async () => {
    const { a, b } = replicas();
    const kept = await book(b, booking(room, `${day}T09:00`, `${day}T10:00`, { title: 'Morning sync' }));
    const cancelled = await book(a, booking(room, `${day}T13:00`, `${day}T17:00`, { title: 'Quarterly planning' }));
    expect([kept.status, cancelled.status]).toEqual([201, 201]);
    expect(await busyTitles(a, room, day)).toEqual(['Morning sync', 'Quarterly planning']);
    expect(await busyTitles(b, room, day)).toEqual(['Morning sync', 'Quarterly planning']);

    expect((await request(a).delete(`/api/bookings/${cancelled.body.id}`)).status).toBe(204);

    expect(await busyTitles(a, room, day)).toEqual(['Morning sync']);
    expect(await busyTitles(b, room, day)).toEqual(['Morning sync']);
    const audit = await request(b).get(`/api/bookings/${cancelled.body.id}`);
    expect(audit.status).toBe(200);
    expect(audit.body).toMatchObject({ id: cancelled.body.id, title: 'Quarterly planning', status: 'cancelled' });
    expect(audit.body.cancelledAt).toEqual(expect.any(String));

    const reuse = await book(b, booking(room, `${day}T13:00`, `${day}T17:00`, { title: 'Team workshop' }));
    expect(reuse.status).toBe(201);
    expect(await busyTitles(a, room, day)).toEqual(['Morning sync', 'Team workshop']);
    expect(await busyTitles(b, room, day)).toEqual(['Morning sync', 'Team workshop']);
  });

  it('reuses the cached day for repeated unchanged reads', async () => {
    const { a } = replicas();
    await book(a, booking(room, `${day}T13:00`, `${day}T17:00`, { title: 'Quarterly planning' }));
    expect(await busyTitles(a, room, day)).toEqual(['Quarterly planning']);

    const loads = vi.spyOn(BookingRepository.prototype, 'findByRooms');
    expect(await busyTitles(a, room, day)).toEqual(['Quarterly planning']);
    expect(await busyTitles(a, room, day)).toEqual(['Quarterly planning']);
    expect(loads).not.toHaveBeenCalled();
  });
});

describe('4B renamed to Everest (FAC-88)', () => {
  it('records 4B as retired and replaced by Everest', async () => {
    const res = await request(createApp()).get('/api/rooms/rm-4b');
    expect(res.body).toMatchObject({ id: 'rm-4b', name: '4B', status: 'retired', replacedBy: 'rm-everest' });
  });

  it('keeps the all-hands booked against 4B and counts it as occupying Everest', async () => {
    const app = createApp();
    const history = await request(app).get('/api/bookings/bk_allhands');
    expect(history.body).toMatchObject({ roomId: 'rm-4b', status: 'confirmed' });

    expect(await busyTitles(app, 'rm-everest', '2026-03-02')).toContain('Monday all-hands');
    const res = await book(app, booking('rm-everest', '2026-03-02T10:00', '2026-03-02T11:00', { title: 'Sales sync' }));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ bookingId: 'bk_allhands', title: 'Monday all-hands' });
  });

  it('refuses new bookings against the old id and points to Everest', async () => {
    const res = await book(createApp(), booking('rm-4b', '2026-11-04T10:00', '2026-11-04T11:00'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROOM_RETIRED');
    expect(res.body.error.message).toContain('rm-everest');
  });

  it('leaves other rooms on the same floor independent', async () => {
    const res = await book(createApp(), booking('rm-aconcagua', '2026-03-02T10:00', '2026-03-02T11:00'));
    expect(res.status).toBe(201);
  });
});
