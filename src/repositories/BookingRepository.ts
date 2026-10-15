import { Database, Queryable } from '../db/Database';
import { BookingRecord } from '../db/types';
import { resolveCanonical, resolveOverlappingRoomIds } from './RoomRepository';

export class BookingRepository {
  constructor(private readonly db: Database) {}

  get(id: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    return q.query((t) => t.bookings.get(id));
  }

  /** All statuses are retained for audit; calendar callers select confirmed rows. */
  findByRooms(roomIds: string[], q: Queryable = this.db): Promise<BookingRecord[]> {
    const ids = new Set(roomIds);
    return q.query((t) => [...t.bookings.values()].filter((b) => ids.has(b.roomId)));
  }

  revision(canonicalRoomId: string, q: Queryable = this.db): Promise<number> {
    return q.query((t) => t.bookingRevisions.get(canonicalRoomId) ?? 0);
  }

  /** Rows and their freshness label must describe the same committed snapshot. */
  snapshotByRooms(roomIds: string[], canonicalRoomId: string, q: Queryable = this.db): Promise<{ revision: number; bookings: BookingRecord[] }> {
    const ids = new Set(roomIds);
    return q.query((t) => ({
      revision: t.bookingRevisions.get(canonicalRoomId) ?? 0,
      bookings: [...t.bookings.values()].filter((b) => ids.has(b.roomId)),
    }));
  }

  insert(b: BookingRecord, q: Queryable = this.db): Promise<BookingRecord> {
    if (q === this.db) return this.db.transaction((tx) => this.insert(b, tx));
    return q.query((t) => {
      if (t.bookings.has(b.id)) throw new Error(`Booking ${b.id} already exists`);
      const views = new Set(resolveOverlappingRoomIds(b.roomId, t.rooms).map((id) => resolveCanonical(id, t.rooms)));
      t.bookings.set(b.id, structuredClone(b));
      for (const view of views) t.bookingRevisions.set(view, (t.bookingRevisions.get(view) ?? 0) + 1);
      return b;
    });
  }

  updateStatus(id: string, status: BookingRecord['status'], at: string, q: Queryable = this.db): Promise<BookingRecord | undefined> {
    if (q === this.db) return this.db.transaction((tx) => this.updateStatus(id, status, at, tx));
    return q.query((t) => {
      const b = t.bookings.get(id);
      if (!b || b.status === status) return b;
      const views = new Set(resolveOverlappingRoomIds(b.roomId, t.rooms).map((roomId) => resolveCanonical(roomId, t.rooms)));
      b.status = status;
      if (status === 'cancelled') b.cancelledAt = at;
      for (const view of views) t.bookingRevisions.set(view, (t.bookingRevisions.get(view) ?? 0) + 1);
      return b;
    });
  }

  count(q: Queryable = this.db): Promise<number> {
    return q.query((t) => t.bookings.size);
  }
}
