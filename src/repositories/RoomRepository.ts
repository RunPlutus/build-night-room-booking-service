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

  /** Room aliases, containing rooms and contained parts; sibling parts stay independent. */
  async overlappingRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const canonicalIds = new Map(rooms.map((r) => [r.id, resolveCanonical(r.id, byId)]));
    const parents = new Map<string, Set<string>>();
    const children = new Map<string, Set<string>>();
    for (const room of rooms) {
      if (!room.parentId) continue;
      const child = canonicalIds.get(room.id)!;
      const parent = resolveCanonical(room.parentId, byId);
      if (child === parent) continue;
      parents.set(child, (parents.get(child) ?? new Set()).add(parent));
      children.set(parent, (children.get(parent) ?? new Set()).add(child));
    }

    const canonical = resolveCanonical(id, byId);
    // Traverse each direction separately: descending from an ancestor would include siblings.
    const overlapping = new Set([...reachableIds(canonical, parents), ...reachableIds(canonical, children)]);
    return rooms.filter((room) => overlapping.has(canonicalIds.get(room.id)!)).map((room) => room.id);
  }
}

function reachableIds(id: string, links: Map<string, Set<string>>): Set<string> {
  const reached = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (reached.has(current)) continue;
    reached.add(current);
    pending.push(...(links.get(current) ?? []));
  }
  return reached;
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
