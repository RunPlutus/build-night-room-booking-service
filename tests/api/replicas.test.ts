import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase, loadSeed } from '../../src/db';
import { metrics } from '../../src/metrics/registry';
import { booking, book, availability } from '../helpers/app';

/** Two replicas sharing one database, like production. */
function replicas(db = createDatabase()) {
  return { a: createApp({ db }), b: createApp({ db }), db };
}

const titles = (res: request.Response) => res.body.busy.map((x: { title: string }) => x.title);

describe('concurrent bookings across replicas (Rainier, Thu 8 Oct)', () => {
  it('confirms exactly one of several simultaneous requests for the same slot', async () => {
    const { a, b } = replicas();
    const slot = booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00');
    const results = await Promise.all([book(a, slot), book(b, slot), book(a, slot), book(b, slot)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);

    const day = await availability(a, 'rm-rainier', '2026-11-05');
    expect(day.body.busy).toHaveLength(1);
  });

  it('still confirms simultaneous requests for different rooms', async () => {
    const { a, b } = replicas();
    const [r1, r2] = await Promise.all([
      book(a, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00')),
      book(b, booking('rm-denali', '2026-11-05T13:00', '2026-11-05T14:00')),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
  });
});

describe('calendar freshness across replicas (Kilimanjaro, Fri 9 Oct)', () => {
  const room = 'rm-kilimanjaro';
  const date = '2026-11-06';

  it('a replica with a cached day sees a booking made through another replica', async () => {
    const { a, b } = replicas();
    expect(titles(await availability(b, room, date))).toEqual([]);

    const created = await book(a, booking(room, `${date}T13:00`, `${date}T17:00`, { title: 'Quarterly planning' }));
    expect(created.status).toBe(201);

    expect(titles(await availability(b, room, date))).toEqual(['Quarterly planning']);
  });

  it('a cancelled booking frees the room on every replica but stays retrievable for audit', async () => {
    const { a, b } = replicas();
    const created = await book(a, booking(room, `${date}T13:00`, `${date}T17:00`, { title: 'Quarterly planning' }));
    expect(titles(await availability(a, room, date))).toEqual(['Quarterly planning']);
    expect(titles(await availability(b, room, date))).toEqual(['Quarterly planning']);

    expect((await request(a).delete(`/api/bookings/${created.body.id}`)).status).toBe(204);

    expect(titles(await availability(a, room, date))).toEqual([]);
    expect(titles(await availability(b, room, date))).toEqual([]);
    const audit = await request(b).get(`/api/bookings/${created.body.id}`);
    expect(audit.body).toMatchObject({ id: created.body.id, status: 'cancelled' });

    const reuse = await book(b, booking(room, `${date}T13:00`, `${date}T17:00`, { title: 'Team workshop' }));
    expect(reuse.status).toBe(201);
    expect(titles(await availability(a, room, date))).toEqual(['Team workshop']);
  });

  it('repeated unchanged reads are still served from the cache', async () => {
    const { a } = replicas();
    await book(a, booking(room, `${date}T13:00`, `${date}T14:00`));
    await availability(a, room, date);
    const hits = () => (metrics.snapshot().availability_cache_hit as number | undefined) ?? 0;
    const before = hits();
    await availability(a, room, date);
    await availability(a, room, date);
    expect(hits() - before).toBe(2);
  });
});

describe('renamed room identity (4B -> Everest, Mon 5 Oct)', () => {
  // A one-off booking still filed under the old 4B id, separate from the seed data.
  function seedWithOld4bBooking() {
    const seed = loadSeed();
    seed.bookings.push({
      id: 'bk_test_old4b',
      roomId: 'rm-4b',
      title: 'Legacy 4B sync',
      organizer: 'tester@example.com',
      start: '2026-11-05T10:00',
      end: '2026-11-05T11:00',
      recurrence: null,
      status: 'confirmed',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    return createDatabase({ seed });
  }

  it('a booking made under the old id blocks the same time in Everest and shows on its calendar', async () => {
    const { a } = replicas(seedWithOld4bBooking());
    const res = await book(a, booking('rm-everest', '2026-11-05T10:00', '2026-11-05T11:00'));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ bookingId: 'bk_test_old4b' });
    expect(titles(await availability(a, 'rm-everest', '2026-11-05'))).toContain('Legacy 4B sync');
  });

  it('keeps the historical booking under its original id and leaves other rooms independent', async () => {
    const { a } = replicas(seedWithOld4bBooking());
    const old = await request(a).get('/api/bookings/bk_test_old4b');
    expect(old.body.roomId).toBe('rm-4b');
    expect((await book(a, booking('rm-aconcagua', '2026-11-05T10:00', '2026-11-05T11:00'))).status).toBe(201);
    expect((await book(a, booking('rm-4b', '2026-11-12T10:00', '2026-11-12T11:00'))).status).toBe(400);
  });
});
