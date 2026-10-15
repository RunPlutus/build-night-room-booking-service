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

  async conflictRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const canon = (x: string) => resolveCanonical(x, byId);

    // canonical child -> canonical parent
    const parent = new Map<string, string>();
    for (const r of rooms) if (r.parentId) parent.set(canon(r.id), canon(r.parentId));

    const target = canon(id);
    const related = new Set<string>([target]);

    // ancestors
    let p = parent.get(target);
    for (let hops = 0; p && hops < 10; hops++) {
      related.add(p);
      p = parent.get(p);
    }

    // descendants (only of target, so siblings aren't included)
    const desc = new Set<string>([target]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [child, par] of parent) {
        if (desc.has(par) && !desc.has(child)) {
          desc.add(child);
          grew = true;
        }
      }
    }
    desc.forEach((d) => related.add(d));

    return rooms.filter((r) => related.has(canon(r.id))).map((r) => r.id);
  }

  /** Every room id that refers to the same physical room as `id`. */
  async physicalRoomIds(id: string, q: Queryable = this.db): Promise<string[]> {
    const rooms = await q.query((t) => [...t.rooms.values()]);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const canonical = resolveCanonical(id, byId);
    return rooms.filter((r) => resolveCanonical(r.id, byId) === canonical).map((r) => r.id);
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
