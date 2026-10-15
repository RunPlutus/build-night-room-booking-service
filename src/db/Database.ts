import { Seed, Tables } from './types';

/** Anything that can run a synchronous query: the database or an open transaction. */
export interface Queryable {
  query<T>(fn: (t: Tables) => T): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embedded document store standing in for Cloud SQL in dev and tests.
 * Public queries and transactions share one FIFO queue. Transactions operate on
 * private drafts, and publish rows and revisions together only after success.
 * Several app instances may share one Database; no app-local lock is required.
 */
export class Database implements Queryable {
  private tables: Tables;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(seed: Seed, private readonly latencyMs = 2) {
    this.tables = {
      rooms: new Map(seed.rooms.map((r) => [r.id, structuredClone(r)])),
      bookings: new Map(seed.bookings.map((b) => [b.id, structuredClone(b)])),
      bookingRevisions: new Map(),
    };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  query<T>(fn: (t: Tables) => T): Promise<T> {
    return this.enqueue(async () => {
      await sleep(this.latencyMs);
      return structuredClone(fn(this.tables));
    });
  }

  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const draft = structuredClone(this.tables);
      let active = true;
      let pending = 0;
      const tx: Queryable = {
        query: (query) => {
          if (!active) return Promise.reject(new Error('Transaction is closed'));
          pending++;
          const operation = (async () => {
            try {
              await sleep(this.latencyMs);
              if (!active) throw new Error('Transaction is closed');
              return structuredClone(query(draft));
            } finally {
              pending--;
            }
          })();
          // A rejected unawaited query must not escape as an unhandled rejection.
          void operation.catch(() => undefined);
          return operation;
        },
      };
      try {
        // Prepare both clones before publication so clone errors also roll back.
        const value = await fn(tx);
        if (pending !== 0) throw new Error('Transaction has pending queries; await all transaction work');
        const result = structuredClone(value);
        const committed = structuredClone(draft);
        this.tables = committed;
        return result;
      } finally {
        active = false;
      }
    });
  }
}
