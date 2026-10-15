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
    const { record, canonical } = await this.db.transaction(async (tx) => {
      const room = await this.rooms.get(input.roomId, tx);
      if (!room) throw new NotFoundError(`Room ${input.roomId}`);
      if (room.status === 'retired') throw new RoomRetiredError(room.id, room.replacedBy);
      const clashes = await this.conflicts.find(input, tx);
      if (clashes.length > 0) {
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
      return { record, canonical: await this.rooms.canonicalId(room.id, tx) };
    });
    this.cache.invalidateRoom(canonical);
    metrics.increment('booking_created');
    events.track('booking_created', { roomId: record.roomId, recurring: !!record.recurrence });
    return record;
  }

  async get(id: string): Promise<BookingRecord> {
    const b = await this.bookings.get(id);
    if (!b) throw new NotFoundError(`Booking ${id}`);
    return b;
  }

  /** Cancelling is idempotent. Cancelled bookings are kept for audit. */
  async cancel(id: string): Promise<BookingRecord> {
    const { record, changed, canonical } = await this.db.transaction(async (tx) => {
      const existing = await this.bookings.get(id, tx);
      if (!existing) throw new NotFoundError(`Booking ${id}`);
      if (existing.status === 'cancelled') return { record: existing, changed: false, canonical: undefined };
      const record = await this.bookings.updateStatus(id, 'cancelled', this.now().toISOString(), tx);
      return { record: record!, changed: true, canonical: await this.rooms.canonicalId(existing.roomId, tx) };
    });
    if (changed) {
      this.cache.invalidateRoom(canonical!);
      metrics.increment('booking_cancelled');
      events.track('booking_cancelled', { roomId: record.roomId });
    }
    return record;
  }
}
