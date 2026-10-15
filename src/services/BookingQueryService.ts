import { RoomRepository } from '../repositories/RoomRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { occurrences } from '../scheduling/recurrence';
import { formatLocal, parseDate, MINUTES_PER_DAY } from '../scheduling/time';
import { ValidationError } from '../errors';

export interface OccurrenceView {
  bookingId: string;
  roomId: string;
  title: string;
  organizer: string;
  start: string;
  end: string;
  status: string;
}

export class BookingQueryService {
  constructor(private readonly rooms: RoomRepository, private readonly bookings: BookingRepository) {}

  /** Occurrences in a room between two dates (inclusive). */
  async between(roomId: string, from: string, to: string): Promise<OccurrenceView[]> {
    if (typeof from !== 'string' || typeof to !== 'string') throw new ValidationError('from and to must be YYYY-MM-DD');
    const lo = parseDate(from);
    const lastDay = parseDate(to);
    if (lastDay < lo) throw new ValidationError('to must be on or after from');
    const hi = lastDay + MINUTES_PER_DAY;
    const ids = await this.rooms.overlappingRoomIds(roomId);
    const out: OccurrenceView[] = [];
    for (const b of await this.bookings.findByRooms(ids)) {
      if (b.status !== 'confirmed') continue;
      for (const o of occurrences(b)) {
        if (o.start < hi && o.end > lo) {
          out.push({ bookingId: b.id, roomId: b.roomId, title: b.title, organizer: b.organizer, start: formatLocal(o.start), end: formatLocal(o.end), status: b.status });
        }
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }
}
