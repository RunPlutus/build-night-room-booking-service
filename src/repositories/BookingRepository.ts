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
      if (b.status === 'confirmed') this.db.markOccupancyChanged();
      return b;
    });
  }

  updateStatus(id: string, status: BookingRecord['status'], at: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    return q.query((t) => {
      const b = t.bookings.get(id);
      if (!b) return undefined;
      const changed = b.status !== status;
      b.status = status;
      if (status === 'cancelled') b.cancelledAt = at;
      if (changed) this.db.markOccupancyChanged();
      return b;
    });
  }

  /** Read before loading bookings, so a snapshot is never tagged with a revision newer than its data. */
  occupancyRevision(): number {
    return this.db.occupancyRevision();
  }

  count(q: Queryable = this.db): Promise<number> {
    return q.query((t) => t.bookings.size);
  }
}
