import { Database, Queryable } from '../db/Database';
import { RoomRecord } from '../db/types';
import { NotFoundError, ValidationError } from '../errors';

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

  /** Aliases of this space and its ancestors/descendants; sibling spaces stay independent. */
  overlappingRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    return q.query((t) => resolveOverlappingRoomIds(id, t.rooms));
  }
}

/** Validates replacement identity and parent links using the same graph as booking paths. */
export function validateRoomSpaces(byId: Map<string, RoomRecord>): void {
  roomSpaceGraph(byId);
}

/** Overlap is symmetric but deliberately not transitive across sibling spaces. */
export function resolveOverlappingRoomIds(id: string, byId: Map<string, RoomRecord>): string[] {
  const { canonicalById, ancestors } = roomSpaceGraph(byId);
  const canonical = canonicalById.get(id);
  if (!canonical) throw new NotFoundError('Room ' + id);
  return [...byId.keys()].filter((other) => {
    const target = canonicalById.get(other)!;
    return target === canonical || ancestors.get(canonical)!.has(target) || ancestors.get(target)!.has(canonical);
  });
}

function roomSpaceGraph(byId: Map<string, RoomRecord>): {
  canonicalById: Map<string, string>;
  ancestors: Map<string, Set<string>>;
} {
  const canonicalById = new Map([...byId.keys()].map((id) => [id, resolveCanonical(id, byId)]));
  const parents = new Map<string, string>();
  for (const room of byId.values()) {
    if (room.parentId === undefined) continue;
    if (typeof room.parentId !== 'string' || !room.parentId || !byId.has(room.parentId)) {
      throw new ValidationError('Invalid parentId for room ' + room.id);
    }
    const canonical = canonicalById.get(room.id)!;
    const parent = canonicalById.get(room.parentId)!;
    const previous = parents.get(canonical);
    if (previous !== undefined && previous !== parent) {
      throw new ValidationError('Inconsistent parentId links for room ' + canonical);
    }
    // A retired alias may be the only record retaining the space's parent metadata.
    parents.set(canonical, parent);
  }

  const ancestors = new Map<string, Set<string>>();
  for (const canonical of new Set(canonicalById.values())) {
    const visited = new Set([canonical]);
    const chain = new Set<string>();
    let parent = parents.get(canonical);
    while (parent !== undefined) {
      if (visited.has(parent)) throw new ValidationError('Room parent cycle at ' + parent);
      visited.add(parent);
      chain.add(parent);
      parent = parents.get(parent);
    }
    ancestors.set(canonical, chain);
  }
  return { canonicalById, ancestors };
}

export function resolveCanonical(id: string, byId: Map<string, RoomRecord>): string {
  let cur = id;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(cur)) throw new ValidationError('room replacement cycle at ' + cur);
    visited.add(cur);
    const room = byId.get(cur);
    if (!room) throw new NotFoundError('Room ' + cur);
    const next = room.replacedBy;
    if (!next) return cur;
    cur = next;
  }
}
