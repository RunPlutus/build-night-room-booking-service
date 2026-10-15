import { Database, Queryable } from '../db/Database';
import { RoomRecord } from '../db/types';

export class RoomRepository {
  constructor(private readonly db: Database) {}

  list(q: Queryable = this.db): Promise<RoomRecord[]> {
    return q.query((t) => [...t.rooms.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }

  get(id: string, q: Queryable = this.db): Promise<RoomRecord | undefined> {
    return q.query((t) => t.rooms.get(id));
  }

  /**
   * Follows replacedBy links so a renamed room and its old record resolve to
   * the same physical room. (Renames keep the old record so historical
   * bookings stay valid; see ADR-0004.)
   */
  async canonicalId(id: string, q: Queryable = this.db): Promise<string> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    return resolveCanonical(id, new Map(rooms.map((r) => [r.id, r])));
  }

  /** Every room id that refers to the same physical room as `id`. */
  async physicalRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const canonical = resolveCanonical(id, byId);
    return rooms.filter((r) => resolveCanonical(r.id, byId) === canonical).map((r) => r.id);
  }

  /**
   * Every room id whose bookings occupy space shared with `id`: the same
   * physical room, rooms that contain it, and rooms it contains (parentId).
   * Siblings that only share a parent do not overlap, so they are excluded.
   */
  async occupancyRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const parentOf = new Map<string, string>();
    for (const r of rooms) if (r.parentId) parentOf.set(resolveCanonical(r.id, byId), resolveCanonical(r.parentId, byId));
    const ancestors = (start: string) => {
      const seen = new Set<string>();
      for (let cur: string | undefined = start; cur && !seen.has(cur); cur = parentOf.get(cur)) seen.add(cur);
      return seen;
    };
    const target = resolveCanonical(id, byId);
    const above = ancestors(target);
    return rooms
      .filter((r) => {
        const c = resolveCanonical(r.id, byId);
        return above.has(c) || ancestors(c).has(target);
      })
      .map((r) => r.id);
  }
}

export function resolveCanonical(id: string, byId: Map<string, RoomRecord>): string {
  let cur = id;
  for (let hops = 0; hops < 10; hops++) {
    const next = byId.get(cur)?.replacedBy;
    if (!next) return cur;
    cur = next;
  }
  return cur;
}
