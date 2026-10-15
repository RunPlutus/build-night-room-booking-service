import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Database, Queryable } from '../../src/db/Database';
import { BookingRecord, Seed } from '../../src/db/types';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { AvailabilityCache } from '../../src/cache/AvailabilityCache';
import { AvailabilityService } from '../../src/services/AvailabilityService';
import { RoomRepository } from '../../src/repositories/RoomRepository';
import { metrics } from '../../src/metrics/registry';
import { availability, book, booking } from '../helpers/app';

const date = '2026-10-15';
const room = { id: 'r', name: 'Room', floor: 1, capacity: 4, status: 'active' as const, createdAt: '2026-01-01' };
const meeting = booking('r', `${date}T10:00`, `${date}T11:00`);
const persisted: BookingRecord = { ...meeting, id: 'b', recurrence: null, status: 'confirmed', createdAt: '2026-01-01' } as BookingRecord;
const seed = (bookings: BookingRecord[] = []): Seed => ({ rooms: [room, { ...room, id: 'other', name: 'Other' }, { ...room, id: 'old', name: 'Old', status: 'retired', replacedBy: 'r' }], bookings });
const latch = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => metrics.reset());
afterEach(() => vi.restoreAllMocks());

describe('independent apps sharing the authoritative database', () => {
  it('confirms exactly one of four concurrent overlapping requests, with every loser returning 409', async () => {
    class PausedDatabase extends Database {
      readonly entered = latch();
      readonly secondAttempted = latch();
      readonly release = latch();
      private attempts = 0;

      override transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
        const attempt = ++this.attempts;
        if (attempt === 2) this.secondAttempted.resolve();
        return super.transaction(async (tx) => {
          if (attempt === 1) {
            this.entered.resolve();
            await this.release.promise;
          }
          return fn(tx);
        });
      }
    }
    const db = new PausedDatabase(seed(), 1);
    const apps = Array.from({ length: 4 }, () => createApp({ db }));
    const pending = Promise.all(apps.map((app) => book(app, meeting)));
    await db.entered.promise;
    await db.secondAttempted.promise;
    db.release.resolve();
    const responses = await pending;
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status !== 201)) expect(response.body.error.code).toBe('CONFLICT');
    expect(await new BookingRepository(db).count()).toBe(1);
    expect(await new BookingRepository(db).revision('r')).toBe(1);
  });

  it('keeps adjacent and different-room concurrent requests independent', async () => {
    const db = new Database(seed(), 0);
    const a = createApp({ db });
    const b = createApp({ db });
    const responses = await Promise.all([
      book(a, meeting),
      book(b, booking('r', `${date}T11:00`, `${date}T12:00`)),
      book(b, { ...meeting, roomId: 'other' }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
  });

  it.each([false, true])('refreshes warm aliases and cold calendars after create/cancel (reverse=%s)', async (reverse) => {
    const db = new Database(seed(), 0);
    const apps = [createApp({ db }), createApp({ db })];
    const [writer, reader] = reverse ? apps.slice().reverse() : apps;
    expect((await availability(reader, 'old', date)).body.busy).toEqual([]);
    const created = await book(writer, meeting);
    expect(created.status).toBe(201);
    for (const app of apps) {
      const view = await availability(app, 'old', date);
      expect(view.body.roomId).toBe('old');
      expect(view.body.busy.map((b: { bookingId: string }) => b.bookingId)).toEqual([created.body.id]);
    }
    await request(reader).delete(`/api/bookings/${created.body.id}`).expect(204);
    for (const app of [...apps, createApp({ db })]) expect((await availability(app, 'r', date)).body.busy).toEqual([]);
    const history = await request(writer).get(`/api/bookings/${created.body.id}`).expect(200);
    expect(history.body).toMatchObject({ id: created.body.id, roomId: 'r', status: 'cancelled', title: meeting.title });
    expect(history.body.cancelledAt).toBeTypeOf('string');
    const list = await request(writer).get('/api/bookings').query({ roomId: 'r', from: date, to: date });
    expect(list.body.occurrences).toEqual([]);
    await book(writer, meeting).expect(201);
    expect((await availability(reader, 'r', date)).body.busy).toHaveLength(1);
  });

  it('increments cancellation revision and success metrics once and preserves first cancelledAt', async () => {
    const db = new Database(seed([persisted]), 0);
    const a = createApp({ db, now: () => new Date('2026-10-15T10:00:00Z') });
    const b = createApp({ db, now: () => new Date('2026-10-16T10:00:00Z') });
    const responses = await Promise.all([request(a).delete('/api/bookings/b'), request(b).delete('/api/bookings/b')]);
    expect(responses.map((r) => r.status)).toEqual([204, 204]);
    const first = (await request(a).get('/api/bookings/b')).body;
    await request(b).delete('/api/bookings/b').expect(204);
    expect((await request(a).get('/api/bookings/b')).body.cancelledAt).toBe(first.cancelledAt);
    expect(await new BookingRepository(db).revision('r')).toBe(1);
    expect(metrics.snapshot().booking_cancelled).toBe(1);
  });

  it('reuses computed days and keeps hits when an unrelated room changes', async () => {
    const snapshot = vi.spyOn(BookingRepository.prototype, 'snapshotByRooms');
    const db = new Database(seed(), 0);
    const a = createApp({ db });
    const b = createApp({ db });
    await availability(b, 'r', date).expect(200);
    await availability(b, 'r', date).expect(200);
    expect(snapshot).toHaveBeenCalledTimes(1);
    await book(a, { ...meeting, roomId: 'other' }).expect(201);
    await availability(b, 'r', date).expect(200);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot().availability_cache_hit).toBe(2);
    await book(a, meeting).expect(201);
    expect((await availability(b, 'r', date)).body.busy).toHaveLength(1);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it.each(['create', 'cancel'])('rejects an older paused cache fill after a newer %s result', async (mutation) => {
    const db = new Database(seed(mutation === 'cancel' ? [persisted] : []), 0);
    const a = createApp({ db });
    const b = createApp({ db });
    const captured = latch();
    const release = latch();
    const original = BookingRepository.prototype.snapshotByRooms;
    let paused = false;
    const snapshot = vi.spyOn(BookingRepository.prototype, 'snapshotByRooms').mockImplementation(async function (this: BookingRepository, ...args) {
      const result = await original.apply(this, args);
      if (!paused) {
        paused = true;
        captured.resolve();
        await release.promise;
      }
      return result;
    });
    const older = availability(b, 'r', date).then((res) => res);
    await captured.promise;
    if (mutation === 'create') await book(a, meeting).expect(201);
    else await request(a).delete('/api/bookings/b').expect(204);
    const expectedCount = mutation === 'create' ? 1 : 0;
    expect((await availability(b, 'r', date)).body.busy).toHaveLength(expectedCount);
    release.resolve();
    await older;
    const snapshotsAfterNewFill = snapshot.mock.calls.length;
    expect((await availability(b, 'r', date)).body.busy).toHaveLength(expectedCount);
    expect(snapshot).toHaveBeenCalledTimes(snapshotsAfterNewFill);
  });

  it('omits cancelled series, preserves cross-midnight endpoints, and validates all query windows', async () => {
    const confirmed = { ...persisted, start: `${date}T23:30`, end: '2026-10-16T00:30' };
    const cancelled = { ...persisted, id: 'cancelled', status: 'cancelled' as const, recurrence: { freq: 'DAILY' as const, count: 2 } };
    const app = createApp({ db: new Database(seed([confirmed, cancelled]), 0) });
    for (const day of [date, '2026-10-16']) {
      const result = await availability(app, 'r', day).expect(200);
      expect(result.body.busy).toEqual([{ bookingId: 'b', title: confirmed.title, start: confirmed.start, end: confirmed.end }]);
      const list = await request(app).get('/api/bookings').query({ roomId: 'r', from: day, to: day }).expect(200);
      expect(list.body.occurrences).toHaveLength(1);
    }
    for (const dates of [{ from: '2026-10-16', to: date }, { from: '2026-02-30', to: date }, { from: [date, date], to: date }]) {
      const response = await request(app).get('/api/bookings').query({ roomId: 'r', ...dates });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    const cache = new AvailabilityCache();
    cache.set({ roomId: 'r', date: '2026-02-30', busy: [] });
    const db = new Database(seed(), 0);
    const service = new AvailabilityService(new RoomRepository(db), new BookingRepository(db), cache);
    await expect(service.forDay('r', '2026-02-30')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('refreshes every cached date when a recurring series is created or cancelled', async () => {
    const db = new Database(seed(), 0);
    const a = createApp({ db });
    const b = createApp({ db });
    const last = '2026-10-26';
    for (const day of [date, last]) expect((await availability(b, 'r', day)).body.busy).toEqual([]);
    const created = await book(a, { ...meeting, recurrence: { freq: 'DAILY', count: 12 } }).expect(201);
    for (const day of [date, last]) expect((await availability(b, 'r', day)).body.busy.map((b: { bookingId: string }) => b.bookingId)).toEqual([created.body.id]);
    await request(a).delete(`/api/bookings/${created.body.id}`).expect(204);
    for (const day of [date, last]) expect((await availability(b, 'r', day)).body.busy).toEqual([]);
  });

  it('rolls back a failed create after insert and permits the next request', async () => {
    const db = new Database(seed(), 0);
    const app = createApp({ db });
    const original = BookingRepository.prototype.insert;
    vi.spyOn(BookingRepository.prototype, 'insert').mockImplementationOnce(async function (this: BookingRepository, ...args) {
      await original.apply(this, args);
      throw new Error('simulated insert failure');
    });
    await book(app, meeting).expect(500);
    expect(await new BookingRepository(db).count()).toBe(0);
    expect(await new BookingRepository(db).revision('r')).toBe(0);
    expect(metrics.snapshot().booking_created).toBeUndefined();
    await book(app, meeting).expect(201);
    expect(await new BookingRepository(db).count()).toBe(1);
    expect(metrics.snapshot().booking_created).toBe(1);
  });

});
