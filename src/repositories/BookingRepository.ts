import { Database, Queryable } from '../db/Database';
import { BookingRecord } from '../db/types';

export class BookingRepository {
  constructor(private readonly db: Database) {}

  get(id: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    return q.query((t) => t.bookings.get(id));
  }

  /** All bookings (any status) in any of the given rooms. Calendar callers select occupying statuses; audit callers retain all. */
  findByRooms(roomIds: string[], q: Queryable = this.db): Promise<BookingRecord[]> {
    const ids = new Set(roomIds);
    return q.query((t) => [...t.bookings.values()].filter((b) => ids.has(b.roomId)));
  }

  insert(b: BookingRecord, q: Queryable = this.db): Promise<BookingRecord> {
    return q.query((t) => {
      t.bookings.set(b.id, structuredClone(b));
      return b;
    });
  }

  updateStatus(id: string, status: BookingRecord['status'], at: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    return q.query((t) => {
      const b = t.bookings.get(id);
      if (!b) return undefined;
      b.status = status;
      if (status === 'cancelled') b.cancelledAt = at;
      return b;
    });
  }

  count(q: Queryable = this.db): Promise<number> {
    return q.query((t) => t.bookings.size);
  }

  roomVersion(roomIds: string[], q: Queryable = this.db): Promise<string> {
    const ids = new Set(roomIds);
    return q.query((t) => {
      const parts: string[] = [];
      for (const b of t.bookings.values()) {
        if (ids.has(b.roomId)) {
          parts.push(`${b.id}:${b.status}:${b.cancelledAt ?? ''}`);
        }
      }
      return parts.sort().join('|');
    });
  }
}
