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
   * Every room id whose bookings occupy space in the same physical room as `id`:
   * the room itself (including renamed records), the whole room it is part of,
   * and its own parts. Sibling parts (e.g. two halves) do not share space.
   */
  async occupiedSpaceRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const ancestors = (roomId: string): string[] => {
      const out: string[] = [];
      let cur: string | undefined = resolveCanonical(roomId, byId);
      while (cur && !out.includes(cur)) {
        out.push(cur);
        const parent: string | undefined = byId.get(cur)?.parentId;
        cur = parent ? resolveCanonical(parent, byId) : undefined;
      }
      return out;
    };
    const mine = ancestors(id);
    const target = mine[0];
    return rooms.filter((r) => {
      const theirs = ancestors(r.id);
      return mine.includes(theirs[0]) || theirs.includes(target);
    }).map((r) => r.id);
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
