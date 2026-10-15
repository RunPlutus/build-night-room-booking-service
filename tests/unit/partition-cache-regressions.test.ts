import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContainer } from '../../src/container/bootstrap';
import { TOKENS } from '../../src/container/tokens';
import { Database } from '../../src/db/Database';
import type { BookingRecord, RoomRecord } from '../../src/db/types';
import { validateBookingInput } from '../../src/services/BookingValidator';

const DATE = '2026-11-03';
const NOW = '2026-10-20T12:00:00.000Z';
const WHOLE = 'room-whole';
const HALF_A = 'room-half-a';
const HALF_B = 'room-half-b';
const rooms: RoomRecord[] = [
  { id: WHOLE, name: 'Whole', floor: 1, capacity: 30, status: 'active', createdAt: NOW },
  { id: HALF_A, name: 'Half A', floor: 1, capacity: 14, status: 'active', parentId: WHOLE, createdAt: NOW },
  { id: HALF_B, name: 'Half B', floor: 1, capacity: 14, status: 'active', parentId: WHOLE, createdAt: NOW },
];

function storedBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'existing-whole-booking', roomId: WHOLE, title: 'Existing meeting', organizer: 'tester@example.com',
    start: `${DATE}T10:00`, end: `${DATE}T11:00`, recurrence: null, status: 'confirmed', createdAt: NOW,
    ...overrides,
  };
}

function app(db: Database) {
  const c = buildContainer({ db, now: () => new Date(NOW) });
  return {
    availability: c.resolve(TOKENS.AvailabilityService),
    bookings: c.resolve(TOKENS.BookingService),
    repository: c.resolve(TOKENS.BookingRepository),
    input: (roomId: string, overrides: Record<string, unknown> = {}) => validateBookingInput({
      roomId, title: 'New meeting', organizer: 'tester@example.com',
      start: `${DATE}T10:00`, end: `${DATE}T11:00`, ...overrides,
    }, c.resolve(TOKENS.Policies)),
  };
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

describe('partitioned room availability caches', () => {
  it('refreshes both warmed halves on every day after a whole-room series is created or cancelled by another app', async () => {
    const db = new Database({ rooms, bookings: [] }, 0);
    const writer = app(db);
    const reader = app(db);
    const dates = [DATE, '2026-11-10', '2026-11-17'];
    for (const roomId of [HALF_A, HALF_B]) {
      for (const date of dates) expect((await reader.availability.forDay(roomId, date)).busy).toEqual([]);
    }

    const created = await writer.bookings.create(writer.input(WHOLE, { recurrence: { freq: 'WEEKLY', count: 3 } }));

    for (const roomId of [HALF_A, HALF_B]) {
      for (const date of dates) {
        expect((await reader.availability.forDay(roomId, date)).busy).toEqual([
          { bookingId: created.id, title: created.title, start: `${date}T10:00`, end: `${date}T11:00` },
        ]);
      }
    }
    await writer.bookings.cancel(created.id);
    for (const roomId of [HALF_A, HALF_B]) {
      for (const date of dates) expect((await reader.availability.forDay(roomId, date)).busy).toEqual([]);
    }
    expect(await reader.bookings.get(created.id)).toMatchObject({ id: created.id, status: 'cancelled', roomId: WHOLE });
  });

  it('refreshes a warmed whole room after half-room writes while retaining the sibling cache', async () => {
    const db = new Database({ rooms, bookings: [] }, 0);
    const writer = app(db);
    const reader = app(db);
    const find = vi.spyOn(reader.repository, 'findByRooms');
    expect((await reader.availability.forDay(WHOLE, DATE)).busy).toEqual([]);
    const siblingBefore = await reader.availability.forDay(HALF_B, DATE);
    expect(find).toHaveBeenCalledTimes(2);

    const created = await writer.bookings.create(writer.input(HALF_A));

    expect((await reader.availability.forDay(WHOLE, DATE)).busy.map((b) => b.bookingId)).toEqual([created.id]);
    expect(await reader.availability.forDay(HALF_B, DATE)).toEqual(siblingBefore);
    expect(find).toHaveBeenCalledTimes(3);
    await writer.bookings.cancel(created.id);
    expect((await reader.availability.forDay(WHOLE, DATE)).busy).toEqual([]);
    expect(await reader.availability.forDay(HALF_B, DATE)).toEqual(siblingBefore);
    expect(find).toHaveBeenCalledTimes(4);
  });

  it.each(['create', 'cancel'] as const)('rejects an old half-room cache refill after whole-room %s', async (action) => {
    const original = storedBooking();
    const db = new Database({ rooms, bookings: action === 'cancel' ? [original] : [] }, 0);
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
    const olderRead = reader.availability.forDay(HALF_A, DATE);

    try {
      await captured.promise;
      const expectedIds: string[] = [];
      if (action === 'create') expectedIds.push((await writer.bookings.create(writer.input(WHOLE))).id);
      else await writer.bookings.cancel(original.id);
      const fresh = await reader.availability.forDay(HALF_A, DATE);
      release.resolve();
      const old = await olderRead;
      const afterOlderRead = await reader.availability.forDay(HALF_A, DATE);

      expect(old.busy.map((b) => b.bookingId)).toEqual(action === 'cancel' ? [original.id] : []);
      expect(fresh.busy.map((b) => b.bookingId)).toEqual(expectedIds);
      expect(afterOlderRead.busy.map((b) => b.bookingId)).toEqual(expectedIds);
      expect(findSpy).toHaveBeenCalledTimes(2);
    } finally {
      release.resolve();
      await olderRead;
    }
  });

  it('preserves partition relationships and invalidation through renamed parent and child references', async () => {
    const OLD_WHOLE = 'room-old-whole';
    const OLD_HALF = 'room-old-half-a';
    const renamedRooms: RoomRecord[] = [
      { id: OLD_WHOLE, name: 'Old whole', floor: 1, capacity: 30, status: 'retired', replacedBy: WHOLE, createdAt: NOW },
      { id: WHOLE, name: 'Current whole', floor: 1, capacity: 30, status: 'active', createdAt: NOW },
      { id: OLD_HALF, name: 'Old half', floor: 1, capacity: 14, status: 'retired', replacedBy: HALF_A, parentId: OLD_WHOLE, createdAt: NOW },
      { id: HALF_A, name: 'Current half', floor: 1, capacity: 14, status: 'active', createdAt: NOW },
    ];
    const original = storedBooking({ id: 'historical-half-booking', roomId: OLD_HALF });
    const db = new Database({ rooms: renamedRooms, bookings: [original] }, 0);
    const writer = app(db);
    const reader = app(db);
    for (const roomId of [OLD_WHOLE, WHOLE, OLD_HALF, HALF_A]) {
      const day = await reader.availability.forDay(roomId, DATE);
      expect(day.roomId).toBe(roomId);
      expect(day.busy.map((b) => b.bookingId)).toEqual([original.id]);
    }

    await writer.bookings.cancel(original.id);
    for (const roomId of [OLD_WHOLE, WHOLE, OLD_HALF, HALF_A]) {
      expect((await reader.availability.forDay(roomId, DATE)).busy).toEqual([]);
    }
    expect(await reader.bookings.get(original.id)).toMatchObject({ id: original.id, roomId: OLD_HALF, status: 'cancelled' });

    const created = await writer.bookings.create(writer.input(WHOLE));
    for (const roomId of [OLD_WHOLE, WHOLE, OLD_HALF, HALF_A]) {
      expect((await reader.availability.forDay(roomId, DATE)).busy.map((b) => b.bookingId)).toEqual([created.id]);
    }
  });
});
