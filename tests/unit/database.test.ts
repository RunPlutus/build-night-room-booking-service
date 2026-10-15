import { describe, expect, it } from 'vitest';
import { Database, Queryable } from '../../src/db/Database';
import { BookingRecord, RoomRecord, Seed } from '../../src/db/types';
import { BookingRepository } from '../../src/repositories/BookingRepository';

const room = { id: 'r', name: 'Room', floor: 1, capacity: 4, status: 'active' as const, createdAt: '2026-01-01' };
const record: BookingRecord = { id: 'b', roomId: 'r', title: 'Meeting', organizer: 'a@example.com', start: '2026-10-15T10:00', end: '2026-10-15T11:00', recurrence: null, status: 'confirmed', createdAt: '2026-01-01' };
const seed = (): Seed => ({ rooms: [structuredClone(room)], bookings: [] });
const latch = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

describe('shared database transaction boundary', () => {
  it('rolls back rows and revisions and recovers the queue after failure', async () => {
    const db = new Database(seed(), 0);
    const repo = new BookingRepository(db);
    await expect(db.transaction(async (tx) => {
      await repo.insert(record, tx);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await repo.get(record.id)).toBeUndefined();
    expect(await repo.revision('r')).toBe(0);
    await repo.insert(record);
    expect(await repo.count()).toBe(1);
    expect(await repo.revision('r')).toBe(1);
  });

  it('queues public queries and writes behind a transaction without losing updates', async () => {
    const db = new Database(seed(), 0);
    const entered = latch();
    const release = latch();
    const order: string[] = [];
    const first = db.transaction(async (tx) => {
      await tx.query((t) => { t.bookings.set(record.id, structuredClone(record)); });
      entered.resolve();
      await release.promise;
      await tx.query(() => { order.push('transaction read'); });
      order.push('transaction');
    });
    await entered.promise;
    const outside = db.query((t) => {
      order.push('outside');
      expect(t.bookings.has(record.id)).toBe(true);
      t.bookings.set('external', { ...record, id: 'external' });
      return t.bookings.size;
    });
    release.resolve();
    await first;
    expect(await outside).toBe(2);
    expect(order).toEqual(['transaction read', 'transaction', 'outside']);
    expect(await db.query((t) => t.bookings.size)).toBe(2);
  });

  it('publishes only committed rows to a queued reader', async () => {
    const db = new Database(seed(), 0);
    const entered = latch();
    const release = latch();
    const failed = db.transaction(async (tx) => {
      await tx.query((t) => t.bookings.set(record.id, structuredClone(record)));
      entered.resolve();
      await release.promise;
      throw new Error('discard draft');
    });
    const checkedFailure = expect(failed).rejects.toThrow('discard draft');
    await entered.promise;
    const read = db.query((t) => [...t.bookings.values()]);
    release.resolve();
    await checkedFailure;
    expect(await read).toEqual([]);
  });

  it('closes transaction handles and defensively copies seed, reads, and return values', async () => {
    const input = seed();
    const db = new Database(input, 0);
    input.rooms[0].name = 'changed seed';
    let escaped!: Queryable;
    const result = await db.transaction(async (tx) => {
      escaped = tx;
      return tx.query((t) => t.rooms.get('r')!);
    });
    result.name = 'changed result';
    expect(await db.query((t) => t.rooms.get('r')!.name)).toBe('Room');
    await expect(escaped.query((t) => t.rooms.size)).rejects.toThrow(/closed|complete|active/i);
  });

  it('does not commit if preparing the transaction result fails', async () => {
    const db = new Database(seed(), 0);
    await expect(db.transaction(async (tx) => {
      await tx.query((t) => t.bookings.set(record.id, structuredClone(record)));
      return () => 'uncloneable';
    })).rejects.toThrow();
    expect(await db.query((t) => t.bookings.size)).toBe(0);
  });

  it('never overwrites booking IDs or advances revisions for rejected/no-op writes', async () => {
    const repo = new BookingRepository(new Database(seed(), 0));
    await repo.insert(record);
    await expect(repo.insert({ ...record, title: 'overwrite' })).rejects.toThrow();
    expect((await repo.get(record.id))!.title).toBe('Meeting');
    expect(await repo.revision('r')).toBe(1);
    const first = await repo.updateStatus(record.id, 'cancelled', '2026-10-15T10:00:00Z');
    const second = await repo.updateStatus(record.id, 'cancelled', '2026-10-16T10:00:00Z');
    expect(second).toEqual(first);
    expect(await repo.revision('r')).toBe(2);
    expect(await repo.updateStatus('missing', 'cancelled', 'now')).toBeUndefined();
    expect(await repo.revision('r')).toBe(2);
  });

  it('keeps paired snapshots and canonical revisions atomic for historical aliases', async () => {
    const input = seed();
    input.rooms.push({ ...room, id: 'old', status: 'retired', replacedBy: 'r' });
    const repo = new BookingRepository(new Database(input, 0));
    await repo.insert({ ...record, roomId: 'old' });
    expect(await repo.snapshotByRooms(['r', 'old'], 'r')).toMatchObject({ revision: 1, bookings: [{ id: 'b', roomId: 'old' }] });
    expect(await repo.revision('old')).toBe(0);
    await repo.updateStatus('b', 'cancelled', '2026-10-15T12:00:00Z');
    expect(await repo.snapshotByRooms(['r', 'old'], 'r')).toMatchObject({ revision: 2, bookings: [{ id: 'b', status: 'cancelled' }] });
  });

  it('isolates a retained transaction callback reference from committed tables', async () => {
    const db = new Database(seed(), 0);
    let retained!: RoomRecord;
    await db.transaction(async (tx) => {
      await tx.query((t) => { retained = t.rooms.get('r')!; });
    });
    retained.name = 'late mutation';
    expect(await db.query((t) => t.rooms.get('r')!.name)).toBe('Room');
  });


  it('rejects unawaited transaction work without committing it', async () => {
    const db = new Database(seed(), 0);
    let pending!: Promise<unknown>;
    await expect(db.transaction(async (tx) => {
      pending = tx.query((t) => t.bookings.set(record.id, structuredClone(record)));
    })).rejects.toThrow(/pending|await/i);
    await expect(pending).rejects.toThrow(/closed/i);
    expect(await db.query((t) => t.bookings.size)).toBe(0);
  });

});
