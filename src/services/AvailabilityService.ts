import { RoomRepository } from '../repositories/RoomRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { AvailabilityCache, CachedDay } from '../cache/AvailabilityCache';
import { occurrences } from '../scheduling/recurrence';
import { overlaps, sortSpans } from '../scheduling/overlap';
import { formatLocal, MINUTES_PER_DAY, parseDate } from '../scheduling/time';
import { NotFoundError } from '../errors';
import { metrics } from '../metrics/registry';

export class AvailabilityService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly bookings: BookingRepository,
    private readonly cache: AvailabilityCache,
  ) {}

  /** Busy periods for a room on one office-local date. */
  async forDay(roomId: string, date: string): Promise<CachedDay> {
    const room = await this.rooms.get(roomId);
    if (!room) throw new NotFoundError(`Room ${roomId}`);
    const canonical = await this.rooms.canonicalId(roomId);
    const ids = await this.rooms.physicalRoomIds(canonical);
    // Validate against the shared database so a write through another replica
    // is visible here too; the expensive series expansion is still skipped.
    const revision = await this.bookings.revision(ids);
    const hit = this.cache.get(canonical, date, revision);
    if (hit) {
      metrics.increment('availability_cache_hit');
      return { ...hit, roomId };
    }
    metrics.increment('availability_cache_miss');

    const dayStart = parseDate(date);
    const day = { start: dayStart, end: dayStart + MINUTES_PER_DAY };
    // Cancelled bookings are kept for audit but don't occupy the room.
    const all = (await this.bookings.findByRooms(ids)).filter((b) => b.status === 'confirmed');

    const busy = [];
    for (const b of all) {
      for (const o of occurrences(b)) {
        if (o.start < day.end && o.end > day.start) busy.push({ ...o, bookingId: b.id, title: b.title });
      }
    }
    const value: CachedDay = {
      roomId: canonical,
      date,
      busy: sortSpans(busy).map((s) => ({ bookingId: s.bookingId, title: s.title, start: formatLocal(s.start), end: formatLocal(s.end) })),
    };
    this.cache.set(value, revision);
    return { ...value, roomId };
  }

  /** Convenience for the UI: is the room free for the whole span? */
  async isFree(roomId: string, date: string, start: number, end: number): Promise<boolean> {
    const d = await this.forDay(roomId, date);
    return !d.busy.some((b) => overlaps({ start, end }, { start: Date.parse(b.start + 'Z') / 60000, end: Date.parse(b.end + 'Z') / 60000 }));
  }
}
