import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContainer } from '../../src/container/bootstrap';
import { TOKENS } from '../../src/container/tokens';
import { Database } from '../../src/db/Database';
import type { BookingRecord, RoomRecord } from '../../src/db/types';
import { validateBookingInput } from '../../src/services/BookingValidator';

const DATE = '2026-11-03';
const NOW = '2026-10-15T12:00:00.000Z';
const ROOM = 'room-current';
const OLD_ROOM = 'room-old';
const OTHER_ROOM = 'room-other';

const rooms: RoomRecord[] = [
  { id: ROOM, name: 'Current', floor: 1, capacity: 6, status: 'active', createdAt: NOW },
  { id: OLD_ROOM, name: 'Old', floor: 1, capacity: 6, status: 'retired', replacedBy: ROOM, createdAt: NOW },
  { id: OTHER_ROOM, name: 'Other', floor: 1, capacity: 4, status: 'active', createdAt: NOW },
];

function storedBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'booking-existing', roomId: ROOM, title: 'Existing meeting', organizer: 'tester@example.com',
    start: `${DATE}T10:00`, end: `${DATE}T11:00`, recurrence: null, status: 'confirmed', createdAt: NOW,
    ...overrides,
  };
}

function database(bookings: BookingRecord[] = []): Database {
  return new Database({ rooms, bookings }, 0);
}

function app(db: Database) {
  const container = buildContainer({ db, now: () => new Date(NOW) });
  return {
    availability: container.resolve(TOKENS.AvailabilityService),
    bookings: container.resolve(TOKENS.BookingService),
    repository: container.resolve(TOKENS.BookingRepository),
    query: container.resolve(TOKENS.BookingQueryService),
    input: (overrides: Record<string, unknown> = {}) => validateBookingInput({
      roomId: ROOM, title: 'New meeting', organizer: 'tester@example.com',
      start: `${DATE}T10:00`, end: `${DATE}T11:00`, ...overrides,
    }, container.resolve(TOKENS.Policies)),
  };
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

describe('availability after completed booking writes', () => {
  it('refreshes another app\'s warmed availability immediately after creation', async () => {
    const db = database();
    const writer = app(db);
    const reader = app(db);
    expect((await reader.availability.forDay(ROOM, DATE)).busy).toEqual([]);

    const created = await writer.bookings.create(writer.input());

    expect((await reader.availability.forDay(ROOM, DATE)).busy).toEqual([
      { bookingId: created.id, title: created.title, start: created.start, end: created.end },
    ]);
  });

  it('refreshes another app\'s warmed availability after cancellation and keeps the audit record', async () => {
    const original = storedBooking();
    const db = database([original]);
    const writer = app(db);
    const reader = app(db);
    expect((await reader.availability.forDay(ROOM, DATE)).busy.map((b) => b.bookingId)).toEqual([original.id]);

    await writer.bookings.cancel(original.id);

    expect((await reader.availability.forDay(ROOM, DATE)).busy).toEqual([]);
    expect(await reader.bookings.get(original.id)).toEqual({ ...original, status: 'cancelled', cancelledAt: NOW });
    expect(await writer.bookings.cancel(original.id)).toEqual({ ...original, status: 'cancelled', cancelledAt: NOW });
    expect(await reader.repository.count()).toBe(1);
  });

  it('invalidates every warmed day and both room references for a small recurring series', async () => {
    const db = database();
    const writer = app(db);
    const reader = app(db);
    const dates = [DATE, '2026-11-10', '2026-11-17'];
    for (const date of dates) {
      for (const roomId of [OLD_ROOM, ROOM]) {
        const day = await reader.availability.forDay(roomId, date);
        expect(day.roomId).toBe(roomId);
        expect(day.busy).toEqual([]);
      }
    }

    const created = await writer.bookings.create(writer.input({ recurrence: { freq: 'WEEKLY', count: 3 } }));
    for (const date of dates) {
      for (const roomId of [OLD_ROOM, ROOM]) {
        const day = await reader.availability.forDay(roomId, date);
        expect(day.roomId).toBe(roomId);
        expect(day.busy).toEqual([
          { bookingId: created.id, title: created.title, start: `${date}T10:00`, end: `${date}T11:00` },
        ]);
      }
    }

    await writer.bookings.cancel(created.id);
    for (const date of dates) {
      for (const roomId of [OLD_ROOM, ROOM]) {
        expect((await reader.availability.forDay(roomId, date)).busy).toEqual([]);
      }
    }
    expect(await reader.bookings.get(created.id)).toMatchObject({ id: created.id, status: 'cancelled', recurrence: { freq: 'WEEKLY', count: 3 } });
  });

  it('invalidates the canonical room when cancelling a historical alias booking', async () => {
    const historical = storedBooking({ roomId: OLD_ROOM });
    const db = database([historical]);
    const writer = app(db);
    const reader = app(db);
    for (const roomId of [ROOM, OLD_ROOM]) {
      expect((await reader.availability.forDay(roomId, DATE)).busy.map((b) => b.bookingId)).toEqual([historical.id]);
    }

    await writer.bookings.cancel(historical.id);

    for (const roomId of [ROOM, OLD_ROOM]) {
      expect((await reader.availability.forDay(roomId, DATE)).busy).toEqual([]);
    }
    expect(await reader.bookings.get(historical.id)).toMatchObject({ id: historical.id, roomId: OLD_ROOM, status: 'cancelled' });
  });

  it('omits seeded cancellations from availability while preserving audit lookups and listings', async () => {
    const cancelled = storedBooking({ roomId: OLD_ROOM, status: 'cancelled', cancelledAt: NOW });
    const reader = app(database([cancelled]));

    for (const roomId of [ROOM, OLD_ROOM]) {
      expect((await reader.availability.forDay(roomId, DATE)).busy).toEqual([]);
    }
    expect(await reader.bookings.get(cancelled.id)).toEqual(cancelled);
    expect(await reader.query.between(ROOM, DATE, DATE)).toEqual([
      {
        bookingId: cancelled.id, roomId: OLD_ROOM, title: cancelled.title, organizer: cancelled.organizer,
        start: cancelled.start, end: cancelled.end, status: 'cancelled',
      },
    ]);
    expect(await reader.repository.count()).toBe(1);
  });
});

describe('availability cache reuse and isolation', () => {
  it('reuses unchanged availability across repeated reads and canonical aliases', async () => {
    const reader = app(database([storedBooking()]));
    const find = vi.spyOn(reader.repository, 'findByRooms');
    const first = await reader.availability.forDay(ROOM, DATE);

    expect(await reader.availability.forDay(ROOM, DATE)).toEqual(first);
    expect(await reader.availability.forDay(OLD_ROOM, DATE)).toEqual({ ...first, roomId: OLD_ROOM });
    expect(await reader.availability.forDay(ROOM, DATE)).toEqual(first);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('keeps independent databases\' values and invalidation separate', async () => {
    const writer = app(database());
    const reader = app(database([storedBooking({ id: 'independent-booking' })]));
    const find = vi.spyOn(reader.repository, 'findByRooms');
    const initial = await reader.availability.forDay(ROOM, DATE);
    expect((await writer.availability.forDay(ROOM, DATE)).busy).toEqual([]);

    const created = await writer.bookings.create(writer.input());

    expect((await writer.availability.forDay(ROOM, DATE)).busy.map((b) => b.bookingId)).toEqual([created.id]);
    expect(await reader.availability.forDay(ROOM, DATE)).toEqual(initial);
    expect(initial.busy.map((b) => b.bookingId)).toEqual(['independent-booking']);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('keeps unrelated rooms cached after creation and cancellation', async () => {
    const db = database([storedBooking({ roomId: OTHER_ROOM })]);
    const writer = app(db);
    const reader = app(db);
    const find = vi.spyOn(reader.repository, 'findByRooms');
    const initial = await reader.availability.forDay(OTHER_ROOM, DATE);

    const created = await writer.bookings.create(writer.input());
    expect(await reader.availability.forDay(OTHER_ROOM, DATE)).toEqual(initial);
    await writer.bookings.cancel(created.id);
    expect(await reader.availability.forDay(OTHER_ROOM, DATE)).toEqual(initial);
    expect(find).toHaveBeenCalledTimes(1);
  });
});

describe('availability reads that finish after a write', () => {
  it.each(['create', 'cancel'] as const)('does not let an older read replace a fresh cache entry after %s', async (action) => {
    const original = storedBooking();
    const db = database(action === 'cancel' ? [original] : []);
    const writer = app(db);
    const reader = app(db);
    const captured = gate();
    const release = gate();
    const find = reader.repository.findByRooms.bind(reader.repository);
    const findSpy = vi.spyOn(reader.repository, 'findByRooms').mockImplementationOnce(async (...args) => {
      const snapshot = await find(...args);
      captured.resolve();
      await release.promise;
      return snapshot;
    });
    const olderRead = reader.availability.forDay(ROOM, DATE);

    try {
      await captured.promise;
      const expectedIds: string[] = [];
      if (action === 'create') {
        expectedIds.push((await writer.bookings.create(writer.input())).id);
      } else {
        await writer.bookings.cancel(original.id);
      }
      const fresh = await reader.availability.forDay(ROOM, DATE);
      release.resolve();
      await olderRead;
      const afterOlderRead = await reader.availability.forDay(ROOM, DATE);

      expect(fresh.busy.map((b) => b.bookingId)).toEqual(expectedIds);
      expect(afterOlderRead.busy.map((b) => b.bookingId)).toEqual(expectedIds);
      expect(findSpy).toHaveBeenCalledTimes(2);
    } finally {
      release.resolve();
      await olderRead;
    }
  });
});

describe('availability across independently loaded app modules', () => {
  it.each(['create', 'cancel'] as const)('shares invalidation after %s even when each replica loads its own modules', async (action) => {
    const original = storedBooking();
    const db = database(action === 'cancel' ? [original] : []);
    async function isolatedApp() {
      // The demo reloads the source graph for each replica, but shares the database object.
      vi.resetModules();
      const [{ buildContainer: build }, { TOKENS: tokens }] = await Promise.all([
        import('../../src/container/bootstrap'),
        import('../../src/container/tokens'),
      ]);
      const container = build({ db, now: () => new Date(NOW) });
      return {
        bookings: container.resolve(tokens.BookingService),
        availability: container.resolve(tokens.AvailabilityService),
        policies: container.resolve(tokens.Policies),
      };
    }
    const writer = await isolatedApp();
    const reader = await isolatedApp();
    expect((await reader.availability.forDay(ROOM, DATE)).busy.map((b) => b.bookingId))
      .toEqual(action === 'cancel' ? [original.id] : []);

    const expectedIds: string[] = [];
    if (action === 'create') {
      const created = await writer.bookings.create(validateBookingInput({
        roomId: ROOM, title: 'New meeting', organizer: 'tester@example.com',
        start: `${DATE}T10:00`, end: `${DATE}T11:00`,
      }, writer.policies));
      expectedIds.push(created.id);
    } else {
      await writer.bookings.cancel(original.id);
    }

    expect((await reader.availability.forDay(ROOM, DATE)).busy.map((b) => b.bookingId)).toEqual(expectedIds);
  });
});
