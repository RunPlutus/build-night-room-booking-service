import { Database, Queryable } from '../db/Database';
import { BookingRecord, Tables } from '../db/types';

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
      bumpRevision(t, b.roomId);
      return b;
    });
  }

  updateStatus(id: string, status: BookingRecord['status'], at: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    return q.query((t) => {
      const b = t.bookings.get(id);
      if (!b) return undefined;
      b.status = status;
      if (status === 'cancelled') b.cancelledAt = at;
      bumpRevision(t, b.roomId);
      return b;
    });
  }

  /** Changes whenever a booking in any of the given rooms is created or changes status. */
  revision(roomIds: string[], q: Queryable = this.db): Promise<string> {
    return q.query((t) => roomIds.map((id) => `${id}@${t.bookingRevisions.get(id) ?? 0}`).join(','));
  }

  count(q: Queryable = this.db): Promise<number> {
    return q.query((t) => t.bookings.size);
  }
}

function bumpRevision(t: Tables, roomId: string): void {
  t.bookingRevisions.set(roomId, (t.bookingRevisions.get(roomId) ?? 0) + 1);
}
