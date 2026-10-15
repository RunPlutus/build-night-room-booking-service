import { Seed, Tables } from './types';

/** Anything that can run a query: the database itself or an open transaction. */
export interface Queryable {
  query<T>(fn: (t: Tables) => T): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embedded document store standing in for Cloud SQL in dev and tests.
 *
 * - Every query is async and takes ~latencyMs, like a network round trip.
 * - Results are deep-copied; callers never hold references into the tables.
 * - transaction() gives SERIALIZABLE isolation: transactions on the same
 *   Database run one at a time, in arrival order.
 *
 * Several app instances (e.g. Cloud Run replicas) may share one Database.
 */
export class Database implements Queryable {
  private readonly tables: Tables;
  private txQueue: Promise<unknown> = Promise.resolve();
  private occupancy = 0;

  constructor(seed: Seed, private readonly latencyMs = 2) {
    this.tables = {
      rooms: new Map(seed.rooms.map((r) => [r.id, structuredClone(r)])),
      bookings: new Map(seed.bookings.map((b) => [b.id, structuredClone(b)])),
    };
  }

  async query<T>(fn: (t: Tables) => T): Promise<T> {
    await sleep(this.latencyMs);
    return structuredClone(fn(this.tables));
  }

  /** Revision of which bookings occupy rooms. Shared by every app instance using this Database. */
  occupancyRevision(): number {
    return this.occupancy;
  }

  /** Must be called inside the query callback that performs the write, so the bump is part of that write. */
  markOccupancyChanged(): void {
    this.occupancy += 1;
  }

  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const tx: Queryable = { query: (f) => this.query(f) };
    const run = this.txQueue.then(() => fn(tx));
    this.txQueue = run.catch(() => undefined);
    return run;
  }
}
