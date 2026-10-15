import type { Database } from '../db/Database';

/**
 * Per-room, per-day availability cache (PERF-19). The calendar UI polls
 * availability for every visible room every 30 s; recomputing recurring
 * series for each poll was the hottest path in production.
 */
export interface CachedDay {
  roomId: string;
  date: string;
  busy: Array<{ bookingId: string; title: string; start: string; end: string }>;
}

export class AvailabilityCache {
  // Stored days are snapshots; later booking writes do not mutate these copies.
  private store = new Map<string, { value: CachedDay; expiresAt: number; version: number }>();
  private readonly versions = new Map<string, number>();

  constructor(private readonly ttlMs = 10 * 60_000, private readonly clock: () => number = Date.now, private readonly database?: Database) {}

  getVersion(roomId: string): number {
    // The Database object, unlike a module singleton, survives replica module
    // isolation. A SQL adapter would need persisted, transactionally advanced
    // versions to provide the same guarantee across separate processes.
    return this.database ? this.database.getRoomVersion(roomId) : this.versions.get(roomId) ?? 0;
  }

  private key(roomId: string, date: string) {
    return `${roomId}:${date}`;
  }

  get(roomId: string, date: string): CachedDay | undefined {
    const e = this.store.get(this.key(roomId, date));
    if (!e) return undefined;
    if (e.expiresAt < this.clock() || e.version !== this.getVersion(roomId)) {
      this.store.delete(this.key(roomId, date));
      return undefined;
    }
    return structuredClone(e.value);
  }

  set(value: CachedDay, version = this.getVersion(value.roomId)): void {
    // A read started before a write may finish after invalidation. Do not let
    // that older snapshot repopulate the cache or replace a newer result.
    if (version !== this.getVersion(value.roomId)) return;
    this.store.set(this.key(value.roomId, value.date), { value: structuredClone(value), expiresAt: this.clock() + this.ttlMs, version });
  }

  /** Drops every cached day for a room. */
  invalidateRoom(roomId: string): void {
    if (this.database) this.database.advanceRoomVersion(roomId);
    else this.versions.set(roomId, this.getVersion(roomId) + 1);
    for (const k of this.store.keys()) if (k.startsWith(`${roomId}:`)) this.store.delete(k);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
