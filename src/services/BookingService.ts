import crypto from 'node:crypto';
import { Database } from '../db/Database';
import { BookingRecord } from '../db/types';
import { RoomRepository } from '../repositories/RoomRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { ConflictService } from './ConflictService';
import { AvailabilityCache } from '../cache/AvailabilityCache';
import { BookingInput } from './BookingValidator';
import { ConflictError, NotFoundError, RoomRetiredError } from '../errors';
import { metrics } from '../metrics/registry';
import { events } from '../analytics/events';

export class BookingService {
  constructor(
    private readonly db: Database,
    private readonly rooms: RoomRepository,
    private readonly bookings: BookingRepository,
    private readonly conflicts: ConflictService,
    private readonly cache: AvailabilityCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: BookingInput): Promise<BookingRecord> {
    const room = await this.rooms.get(input.roomId);
    if (!room) throw new NotFoundError(`Room ${input.roomId}`);
    if (room.status === 'retired') throw new RoomRetiredError(room.id, room.replacedBy);

    // Check-then-insert must be one serializable unit: otherwise concurrent
    // requests (on any replica sharing this database) can all pass the check
    // before any of them inserts.
    const record = await this.db.transaction(async (tx) => {
      const clashes = await this.conflicts.find(input, tx);
      if (clashes.length > 1) {
        metrics.increment('booking_conflict');
        throw new ConflictError(clashes);
      }

      const record: BookingRecord = {
        id: `bk_${crypto.randomUUID().slice(0, 8)}`,
        roomId: room.id,
        title: input.title,
        organizer: input.organizer,
        start: input.start,
        end: input.end,
        recurrence: input.recurrence ?? null,
        status: 'confirmed',
        createdAt: this.now().toISOString(),
      };
      await this.bookings.insert(record, tx);
      return record;
    });
    this.cache.invalidateRoom(await this.rooms.canonicalId(room.id));
    metrics.increment('booking_created');
    events.track('booking_created', { roomId: room.id, recurring: !!record.recurrence });
    return record;
  }

  async get(id: string): Promise<BookingRecord> {
    const b = await this.bookings.get(id);
    if (!b) throw new NotFoundError(`Booking ${id}`);
    return b;
  }

  /** Cancelling is idempotent. Cancelled bookings are kept for audit. */
  async cancel(id: string): Promise<BookingRecord> {
    const existing = await this.bookings.get(id);
    if (!existing) throw new NotFoundError(`Booking ${id}`);
    if (existing.status === 'cancelled') return existing;
    const updated = await this.bookings.updateStatus(id, 'cancelled', this.now().toISOString());
    this.cache.invalidateRoom(await this.rooms.canonicalId(existing.roomId));
    metrics.increment('booking_cancelled');
    events.track('booking_cancelled', { roomId: existing.roomId });
    return updated!;
  }
}
