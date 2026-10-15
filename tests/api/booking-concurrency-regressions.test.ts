import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/container/bootstrap';
import { TOKENS } from '../../src/container/tokens';
import { Database } from '../../src/db/Database';
import { RoomRecord } from '../../src/db/types';
import { book, booking } from '../helpers/app';

function sharedDatabase(): Database {
  const rooms: RoomRecord[] = ['rm-first', 'rm-second'].map((id) => ({
    id,
    name: id,
    floor: 1,
    capacity: 8,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  return new Database({ rooms, bookings: [] }, 5);
}

describe('booking writes across applications sharing a database', () => {
  it('confirms exactly one simultaneous same-slot request and identifies it in every conflict', async () => {
    const db = sharedDatabase();
    const apps = [createApp({ db }), createApp({ db })];
    const responses = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        book(apps[index % apps.length], booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00', { title: `Candidate ${index}` })),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409]);
    const winner = responses.find((response) => response.status === 201)!.body;
    expect(winner.status).toBe('confirmed');
    for (const conflict of responses.filter((response) => response.status === 409)) {
      expect(conflict.body.error).toMatchObject({
        code: 'CONFLICT',
        details: [{ bookingId: winner.id, title: winner.title, start: winner.start, end: winner.end }],
      });
    }
    const records = await db.query((tables) => [...tables.bookings.values()]);
    expect(records.map((record) => record.id)).toEqual([winner.id]);
  });

  it('serializes a small recurring series against a one-off on its second occurrence', async () => {
    const db = sharedDatabase();
    const firstApp = createApp({ db });
    const secondApp = createApp({ db });
    const responses = await Promise.all([
      book(firstApp, booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00', {
        title: 'Weekly team meeting',
        recurrence: { freq: 'WEEKLY', count: 3 },
      })),
      book(secondApp, booking('rm-first', '2026-11-10T13:30', '2026-11-10T14:30', { title: 'Customer call' })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const winner = responses.find((response) => response.status === 201)!.body;
    const conflict = responses.find((response) => response.status === 409)!;
    expect(conflict.body.error.code).toBe('CONFLICT');
    expect(conflict.body.error.details).toEqual([
      expect.objectContaining({ bookingId: winner.id, title: winner.title, start: expect.stringMatching(/^2026-11-10T/) }),
    ]);
    expect(await db.query((tables) => tables.bookings.size)).toBe(1);
  });

  it('allows simultaneous requests for independent rooms', async () => {
    const db = sharedDatabase();
    const responses = await Promise.all([
      book(createApp({ db }), booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00')),
      book(createApp({ db }), booking('rm-second', '2026-11-03T13:00', '2026-11-03T14:00')),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(2);
    expect(await db.query((tables) => tables.bookings.size)).toBe(2);
  });

  it('continues processing writes after a rejected conflict', async () => {
    const db = sharedDatabase();
    const firstApp = createApp({ db });
    const secondApp = createApp({ db });
    const original = await book(firstApp, booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00'));
    expect(original.status).toBe(201);

    const conflict = await book(secondApp, booking('rm-first', '2026-11-03T13:30', '2026-11-03T14:30'));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details[0].bookingId).toBe(original.body.id);
    const later = await book(secondApp, booking('rm-first', '2026-11-03T15:00', '2026-11-03T16:00'));
    expect(later.status).toBe(201);
    await request(firstApp).delete(`/api/bookings/${original.body.id}`).expect(204);
    const replacement = await book(secondApp, booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00'));
    expect(replacement.status).toBe(201);
    const history = await request(secondApp).get(`/api/bookings/${original.body.id}`).expect(200);
    expect(history.body).toMatchObject({ id: original.body.id, status: 'cancelled' });
  });

  it('keeps the first cancellation timestamp when cancellation requests race', async () => {
    const db = sharedDatabase();
    const initial = await book(createApp({ db }), booking('rm-first', '2026-11-03T13:00', '2026-11-03T14:00'));
    expect(initial.status).toBe(201);
    const firstService = buildContainer({ db, now: () => new Date('2026-11-01T08:00:00.000Z') }).resolve(TOKENS.BookingService);
    const secondService = buildContainer({ db, now: () => new Date('2026-11-01T08:01:00.000Z') }).resolve(TOKENS.BookingService);

    const cancelled = await Promise.all([firstService.cancel(initial.body.id), secondService.cancel(initial.body.id)]);
    expect(cancelled[0].status).toBe('cancelled');
    expect(cancelled[1]).toEqual(cancelled[0]);
    expect(cancelled[0].cancelledAt).toBe('2026-11-01T08:00:00.000Z');
    expect(await secondService.get(initial.body.id)).toEqual(cancelled[0]);
    expect(await secondService.cancel(initial.body.id)).toEqual(cancelled[0]);
  });
});
