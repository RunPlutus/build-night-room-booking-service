import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { Database, Queryable } from '../../src/db/Database';
import { BookingRecord, RoomRecord } from '../../src/db/types';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { availability, book, booking } from '../helpers/app';

const date = '2026-11-12';
const whole = 'whole';
const a = 'half-a';
const b = 'half-b';
const room = (id: string, extra: Partial<RoomRecord> = {}): RoomRecord => ({
  id, name: id, floor: 6, capacity: 14, status: 'active', createdAt: '2026-10-19T00:00:00.000Z', ...extra,
});
// The retired half alone retains its parent metadata; the parent has two aliases.
const rooms = (): RoomRecord[] => [
  room('old-whole', { status: 'retired', replacedBy: 'middle-whole' }),
  room('middle-whole', { status: 'retired', replacedBy: whole }), room(whole),
  room('old-a', { status: 'retired', replacedBy: a, parentId: 'old-whole' }), room(a),
  room(b, { parentId: 'middle-whole' }), room('unrelated'),
];
const meeting = (id: string, extra: Record<string, unknown> = {}) =>
  booking(id, `${date}T10:00`, `${date}T11:00`, extra);
const persisted = (id: string, roomId: string, extra: Partial<BookingRecord> = {}): BookingRecord => ({
  ...meeting(roomId), id, roomId, recurrence: null, status: 'confirmed',
  createdAt: '2026-10-14T00:00:00.000Z', ...extra,
} as BookingRecord);
const setup = (bookings: BookingRecord[] = []) => {
  const db = new Database({ rooms: rooms(), bookings }, 0);
  return { db, apps: [createApp({ db }), createApp({ db })] };
};
const latch = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const state = (db: Database) => db.query((t) => ({
  history: [...t.bookings.values()], revisions: [...t.bookingRevisions.entries()],
}));
const listed = (app: ReturnType<typeof createApp>, id: string, day = date) =>
  request(app).get('/api/bookings').query({ roomId: id, from: day, to: day });

afterEach(() => vi.restoreAllMocks());

describe('adversarial divider integration', () => {
  it('keeps historical alias identities across renamed parent/half calendars and cancellations', async () => {
    const parent = persisted('historical-parent', 'old-whole');
    const half = persisted('historical-half', 'old-a', { start: `${date}T12:00`, end: `${date}T13:00` });
    const { db, apps } = setup([parent, half]);
    for (const id of ['old-whole', 'middle-whole', whole]) {
      const list = await listed(apps[0], id).expect(200);
      expect(list.body.occurrences.map((row: { roomId: string }) => row.roomId)).toEqual(['old-whole', 'old-a']);
    }
    for (const id of ['old-a', a]) {
      expect((await listed(apps[0], id).expect(200)).body.occurrences).toEqual([
        expect.objectContaining({ bookingId: parent.id, roomId: 'old-whole' }),
        expect.objectContaining({ bookingId: half.id, roomId: 'old-a' }),
      ]);
    }
    expect((await listed(apps[0], b).expect(200)).body.occurrences).toEqual([
      expect.objectContaining({ bookingId: parent.id, roomId: 'old-whole' }),
    ]);
    await book(apps[1], meeting(a)).expect(409);
    await book(apps[1], meeting(whole, { start: half.start, end: half.end })).expect(409);
    await book(apps[1], meeting(b, { start: half.start, end: half.end })).expect(201);
    await request(apps[1]).delete(`/api/bookings/${parent.id}`).expect(204);
    await book(apps[0], meeting(a)).expect(201);
    await request(apps[0]).delete(`/api/bookings/${half.id}`).expect(204);
    for (const record of [parent, half]) {
      const history = await request(apps[1]).get(`/api/bookings/${record.id}`).expect(200);
      expect(history.body).toMatchObject({ ...record, status: 'cancelled' });
      expect(history.body.cancelledAt).toBeTypeOf('string');
    }
    const before = await state(db);
    await book(apps[0], meeting('old-a')).expect(400);
    expect(await state(db)).toEqual(before);
  });

  it.each([[whole, a], [a, whole]])('handles the final cross-midnight occurrence from %s on %s through cancellation', async (source, view) => {
    const { apps } = setup();
    const firstStart = `${date}T23:45`;
    const firstEnd = '2026-11-13T00:30';
    for (const day of ['2026-12-01', '2026-12-02']) await availability(apps[1], view, day).expect(200);
    const created = await book(apps[0], booking(source, firstStart, firstEnd, {
      recurrence: { freq: 'DAILY', count: 20, until: '2026-12-01' },
    })).expect(201);
    const spill = booking(view, '2026-12-02T00:00', '2026-12-02T00:15');
    const conflict = await book(apps[1], spill).expect(409);
    expect(conflict.body.error.details).toEqual([
      expect.objectContaining({ bookingId: created.body.id, start: '2026-12-01T23:45', end: '2026-12-02T00:30' }),
    ]);
    for (const day of ['2026-12-01', '2026-12-02']) {
      const calendar = await listed(apps[1], view, day).expect(200);
      expect(calendar.body.occurrences).toContainEqual(expect.objectContaining({
        bookingId: created.body.id, roomId: source, start: '2026-12-01T23:45', end: '2026-12-02T00:30',
      }));
    }
    expect((await availability(apps[1], view, '2026-12-02').expect(200)).body.busy).toEqual([
      expect.objectContaining({ bookingId: created.body.id, start: '2026-12-01T23:45', end: '2026-12-02T00:30' }),
    ]);
    const sibling = source === a ? await book(apps[1], { ...spill, roomId: b }).expect(201) : undefined;
    await request(apps[1]).delete(`/api/bookings/${created.body.id}`).expect(204);
    expect((await availability(apps[0], a, '2026-12-02').expect(200)).body.busy).toEqual([]);
    expect((await listed(apps[0], a, '2026-12-02').expect(200)).body.occurrences).toEqual([]);
    await book(apps[0], { ...spill, roomId: a }).expect(201);
    if (sibling) {
      expect((await listed(apps[0], b, '2026-12-02').expect(200)).body.occurrences.map((row: { bookingId: string }) => row.bookingId))
        .toEqual([sibling.body.id]);
    }
  });

  it.each([
    [[whole, a, b], [201, 409, 409], [1, 1, 1]],
    [[a, whole, b], [201, 409, 201], [2, 1, 1]],
  ] as const)('serializes a controlled three-way queue in order %s', async (order, statuses, revisions) => {
    class PausedDatabase extends Database {
      readonly entered = latch();
      readonly secondAttempted = latch();
      readonly thirdAttempted = latch();
      readonly release = latch();
      private attempts = 0;
      override transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
        const attempt = ++this.attempts;
        if (attempt === 2) this.secondAttempted.resolve();
        if (attempt === 3) this.thirdAttempted.resolve();
        return super.transaction(async (tx) => {
          if (attempt === 1) { this.entered.resolve(); await this.release.promise; }
          return fn(tx);
        });
      }
    }
    const db = new PausedDatabase({ rooms: rooms(), bookings: [] }, 0);
    const apps = Array.from({ length: 3 }, () => createApp({ db }));
    const first = book(apps[0], meeting(order[0])).then((response) => response);
    await db.entered.promise;
    const second = book(apps[1], meeting(order[1])).then((response) => response);
    await db.secondAttempted.promise;
    const third = book(apps[2], meeting(order[2])).then((response) => response);
    await db.thirdAttempted.promise;
    db.release.resolve();
    const results = await Promise.all([first, second, third]);
    expect(results.map((response) => response.status)).toEqual(statuses);
    const winners = results.filter((response) => response.status === 201);
    for (const loser of results.filter((response) => response.status === 409)) {
      expect(loser.body.error.code).toBe('CONFLICT');
      expect(loser.body.error.details).toEqual([expect.objectContaining({ bookingId: results[0].body.id })]);
    }
    const repo = new BookingRepository(db);
    expect(await repo.count()).toBe(winners.length);
    expect(await Promise.all([whole, a, b].map((id) => repo.revision(id)))).toEqual(revisions);
    expect((await listed(apps[0], whole).expect(200)).body.occurrences.map((row: { bookingId: string }) => row.bookingId).sort())
      .toEqual(winners.map((response) => response.body.id).sort());
  });

  it.each(['create-half', 'cancel-whole'] as const)('keeps a newer aliased overlapping calendar after an older fill resumes (%s)', async (mutation) => {
    const historical = persisted('historical-parent', 'old-whole');
    const { apps } = setup(mutation === 'cancel-whole' ? [historical] : []);
    const view = mutation === 'create-half' ? 'old-whole' : 'old-a';
    const captured = latch();
    const release = latch();
    const original = BookingRepository.prototype.snapshotByRooms;
    let paused = false;
    const snapshot = vi.spyOn(BookingRepository.prototype, 'snapshotByRooms').mockImplementation(async function (this: BookingRepository, ...args) {
      const value = await original.apply(this, args);
      if (!paused) { paused = true; captured.resolve(); await release.promise; }
      return value;
    });
    const older = availability(apps[1], view, date).then((response) => response);
    await captured.promise;
    let expected: string[] = [];
    let newer;
    try {
      if (mutation === 'create-half') {
        expected = [(await book(apps[0], meeting(a)).expect(201)).body.id];
      } else await request(apps[0]).delete(`/api/bookings/${historical.id}`).expect(204);
      newer = await availability(apps[1], view, date).expect(200);
    } finally { release.resolve(); }
    await older;
    expect(newer!.body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual(expected);
    const fills = snapshot.mock.calls.length;
    expect((await availability(apps[1], view, date).expect(200)).body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual(expected);
    expect(snapshot).toHaveBeenCalledTimes(fills);
    expect((await listed(apps[1], view).expect(200)).body.occurrences.map((row: { bookingId: string }) => row.bookingId)).toEqual(expected);
  });

  it('rejects a series with only a late half conflict without touching any history, revisions, or warm views', async () => {
    const cancelled = persisted('cancelled-history', 'old-whole', { status: 'cancelled', cancelledAt: '2026-10-15T00:00:00.000Z' });
    const { db, apps } = setup([cancelled]);
    const existing = await book(apps[0], booking(a, '2026-11-14T10:00', '2026-11-14T11:00')).expect(201);
    for (const id of [whole, a, b, 'old-whole', 'old-a', 'unrelated']) await availability(apps[1], id, date).expect(200);
    const before = await state(db);
    const snapshot = vi.spyOn(BookingRepository.prototype, 'snapshotByRooms');
    const rejected = await book(apps[0], meeting(whole, { recurrence: { freq: 'DAILY', count: 3 } })).expect(409);
    expect(rejected.body.error.details).toEqual([expect.objectContaining({ bookingId: existing.body.id, start: '2026-11-14T10:00' })]);
    expect(await state(db)).toEqual(before);
    for (const id of [whole, a, b, 'old-whole', 'old-a', 'unrelated']) {
      expect((await availability(apps[1], id, date).expect(200)).body.busy).toEqual([]);
    }
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('rolls back an interrupted parent cancellation across every dependent revision and historical record', async () => {
    const { db, apps } = setup();
    const created = await book(apps[0], meeting(whole)).expect(201);
    for (const id of [whole, a, b, 'old-whole', 'old-a']) await availability(apps[1], id, date).expect(200);
    const before = await state(db);
    const original = BookingRepository.prototype.updateStatus;
    vi.spyOn(BookingRepository.prototype, 'updateStatus').mockImplementationOnce(async function (this: BookingRepository, ...args) {
      await original.apply(this, args);
      throw new Error('adversarial cancellation failure after dependent revisions');
    });
    await request(apps[0]).delete(`/api/bookings/${created.body.id}`).expect(500);
    expect(await state(db)).toEqual(before);
    for (const id of [whole, a, b, 'old-whole', 'old-a']) {
      expect((await availability(apps[1], id, date).expect(200)).body.busy.map((row: { bookingId: string }) => row.bookingId)).toEqual([created.body.id]);
    }
    await request(apps[1]).delete(`/api/bookings/${created.body.id}`).expect(204);
    const repo = new BookingRepository(db);
    expect(await Promise.all([whole, a, b].map((id) => repo.revision(id)))).toEqual([2, 2, 2]);
    expect((await repo.get(created.body.id))?.status).toBe('cancelled');
  });
});
