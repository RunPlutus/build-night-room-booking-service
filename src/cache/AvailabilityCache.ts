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
  private store = new Map<string, { value: CachedDay; revision: number; expiresAt: number }>();

  constructor(private readonly ttlMs = 10 * 60_000, private readonly clock: () => number = Date.now) {}

  private key(roomId: string, date: string) {
    return `${roomId}:${date}`;
  }

  get(roomId: string, date: string, expectedRevision?: number): CachedDay | undefined {
    const e = this.store.get(this.key(roomId, date));
    if (!e) return undefined;
    if (e.expiresAt < this.clock()) {
      this.store.delete(this.key(roomId, date));
      return undefined;
    }
    if (expectedRevision !== undefined && e.revision !== expectedRevision) return undefined;
    return structuredClone(e.value);
  }

  set(value: CachedDay, revision = 0): void {
    const key = this.key(value.roomId, value.date);
    const existing = this.store.get(key);
    if (existing && existing.revision > revision) return;
    this.store.set(key, { value: structuredClone(value), revision, expiresAt: this.clock() + this.ttlMs });
  }

  /** Drops every cached day for a room. */
  invalidateRoom(roomId: string): void {
    for (const k of this.store.keys()) if (k.startsWith(`${roomId}:`)) this.store.delete(k);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
