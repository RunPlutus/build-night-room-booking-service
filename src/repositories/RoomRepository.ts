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

  /** Same room, its whole room, or its parts; independent sibling parts do not overlap. */
  async occupyingRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((room) => [room.id, room]));
    const canonical = resolveCanonical(id, byId);
    const parentOf = (roomId: string): string | undefined => {
      const parent = byId.get(roomId)?.parentId;
      return parent ? resolveCanonical(parent, byId) : undefined;
    };
    const parent = parentOf(canonical);
    return rooms.filter((room) => {
      const other = resolveCanonical(room.id, byId);
      return other === canonical || other === parent || parentOf(other) === canonical;
    }).map((room) => room.id);
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
