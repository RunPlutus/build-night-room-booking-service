import { Database, Queryable } from '../db/Database';
import { RoomRepository } from '../repositories/RoomRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { occurrences, Schedulable } from '../scheduling/recurrence';
import { overlaps } from '../scheduling/overlap';
import { formatLocal } from '../scheduling/time';
import { ConflictInfo } from '../errors';

export interface Candidate extends Schedulable {
  roomId: string;
}

export class ConflictService {
  constructor(
    private readonly db: Database,
    private readonly rooms: RoomRepository,
    private readonly bookings: BookingRepository,
  ) {}

  /**
   * Returns the existing confirmed bookings that clash with `candidate`
   * (one entry per clashing booking, showing its first clashing occurrence).
   */
  async find(candidate: Candidate, q: Queryable = this.db): Promise<ConflictInfo[]> {
    const roomIds = await this.rooms.blockingRoomIds(candidate.roomId, q);
    const existing = (await this.bookings.findByRooms(roomIds, q)).filter((b) => b.status === 'confirmed');
    const mine = occurrences(candidate);
    const out: ConflictInfo[] = [];
    for (const b of existing) {
      const theirs = occurrences(b);
      const hit = theirs.find((t) => mine.some((m) => overlaps(m, t)));
      if (hit) out.push({ bookingId: b.id, title: b.title, start: formatLocal(hit.start), end: formatLocal(hit.end) });
    }
    return out;
  }
}
