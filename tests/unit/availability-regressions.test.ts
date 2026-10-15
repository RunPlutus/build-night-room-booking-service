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
