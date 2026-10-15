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
   * Every room id whose bookings occupy space shared with `id`: the room
   * itself, the rooms it is part of, and the rooms that are part of it,
   * each with its renamed aliases. Sibling parts share no space.
   */
  async blockingRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const target = resolveCanonical(id, byId);
    const above = ancestry(target, byId);
    return rooms.filter((r) => above.has(resolveCanonical(r.id, byId)) || ancestry(r.id, byId).has(target)).map((r) => r.id);
  }
}

/** Canonical ids of `id` and every room it is physically inside of. */
export function ancestry(id: string, byId: Map<string, RoomRecord>): Set<string> {
  const out = new Set<string>();
  let cur = resolveCanonical(id, byId);
  while (!out.has(cur)) {
    out.add(cur);
    const parent = byId.get(cur)?.parentId;
    if (!parent) break;
    cur = resolveCanonical(parent, byId);
  }
  return out;
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
