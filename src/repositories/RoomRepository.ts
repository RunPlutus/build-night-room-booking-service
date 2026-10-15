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

  /** Every room id whose physical space overlaps with `id` (via replacedBy or parentId). */
  async physicalRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const parents = new Map<string, string>();
    for (const r of rooms) {
      if (r.parentId) {
        parents.set(resolveCanonical(r.id, byId), resolveCanonical(r.parentId, byId));
      }
    }
    const ancestors = (roomId: string): Set<string> => {
      const result = new Set<string>();
      let cur: string | undefined = resolveCanonical(roomId, byId);
      while (cur && !result.has(cur)) {
        result.add(cur);
        cur = parents.get(cur);
      }
      return result;
    };
    const targetCanonical = resolveCanonical(id, byId);
    const targetAncestors = ancestors(targetCanonical);
    return rooms
      .filter((r) => {
        const c = resolveCanonical(r.id, byId);
        return targetAncestors.has(c) || ancestors(c).has(targetCanonical);
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
