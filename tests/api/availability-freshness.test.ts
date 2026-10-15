import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase, Database } from '../../src/db';
import { Tables } from '../../src/db/types';
import { App, booking } from '../helpers/app';

const FAIL_AFTER_MS = 5000;
const ROOM = 'rm-kilimanjaro';
const DATE = '2027-03-04';
const SLOT = [`${DATE}T13:00`, `${DATE}T17:00`] as const;

/** Fails (never releases) a wait that has not happened within FAIL_AFTER_MS. */
function within<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const fail = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), FAIL_AFTER_MS);
  });
  return Promise.race([p, fail]).finally(() => clearTimeout(timer));
}

function signal() {
  let fire!: () => void;
  const fired = new Promise<void>((resolve) => (fire = resolve));
  return { fired, fire };
}

/**
 * Calls `after(n)` once each query that touched the bookings table has run
 * (its snapshot is taken) and before it returns. Returns the restore function.
 */
function watchBookingsQueries(db: Database, after: (n: number) => Promise<void> | void): () => void {
  const query = db.query.bind(db);
  let n = 0;
  db.query = async <T,>(fn: (t: Tables) => T): Promise<T> => {
    let touched = false;
    const result = await query((t) =>
      fn(
        new Proxy(t, {
          get(target, key, receiver) {
            if (key === 'bookings') touched = true;
            return Reflect.get(target, key, receiver);
          },
        }),
      ),
    );
    if (touched) await after(++n);
    return result;
  };
  return () => Reflect.deleteProperty(db, 'query');
}

function create(app: App, body: object) {
  return within(request(app).post('/api/bookings').send(body).then((res) => res), 'a create');
}

function availability(app: App, roomId: string, date = DATE) {
  return request(app).get(`/api/rooms/${roomId}/availability`).query({ date }).then((res) => res);
}

async function busyTitles(app: App, roomId: string, date = DATE): Promise<string[]> {
  const res = await within(availability(app, roomId, date), `availability for ${roomId}`);
  expect(res.status).toBe(200);
  return res.body.busy.map((b: { title: string }) => b.title).sort();
}

function twoReplicas() {
  const db = createDatabase();
  return { db, a: createApp({ db }), b: createApp({ db }) };
}

describe('availability after a completed write, across instances sharing one database', () => {
  it.each(['a', 'b'] as const)('shows a booking created through instance %s on both warmed instances', async (writer) => {
    const replicas = twoReplicas();
    const before = await busyTitles(replicas.a, ROOM);
    expect(await busyTitles(replicas.b, ROOM)).toEqual(before);

    expect((await create(replicas[writer], booking(ROOM, ...SLOT, { title: 'Quarterly planning' }))).status).toBe(201);

    const expected = [...before, 'Quarterly planning'].sort();
    expect(await busyTitles(replicas.a, ROOM)).toEqual(expected);
    expect(await busyTitles(replicas.b, ROOM)).toEqual(expected);
  });

  it('drops a cancelled booking from both warmed instances and keeps its audit record', async () => {
    const { a, b } = twoReplicas();
    const before = await busyTitles(a, ROOM);
    const created = await create(a, booking(ROOM, ...SLOT, { title: 'Quarterly planning' }));
    expect(created.status).toBe(201);
    expect(await busyTitles(a, ROOM)).toContain('Quarterly planning');
    expect(await busyTitles(b, ROOM)).toContain('Quarterly planning');

    await request(a).delete(`/api/bookings/${created.body.id}`).expect(204);

    expect(await busyTitles(a, ROOM)).toEqual(before);
    expect(await busyTitles(b, ROOM)).toEqual(before);
    const audit = await request(b).get(`/api/bookings/${created.body.id}`);
    expect(audit.body).toMatchObject({ id: created.body.id, status: 'cancelled' });
    await request(b).delete(`/api/bookings/${created.body.id}`).expect(204);
  });
});

describe('Summit availability (whole room and its two halves)', () => {
  it('shows a whole-Summit booking on both halves', async () => {
    const app = createApp();
    expect((await create(app, booking('rm-summit', `${DATE}T10:00`, `${DATE}T11:00`, { title: 'Whole room' }))).status).toBe(201);
    expect(await busyTitles(app, 'rm-summit')).toContain('Whole room');
    expect(await busyTitles(app, 'rm-summit-a')).toContain('Whole room');
    expect(await busyTitles(app, 'rm-summit-b')).toContain('Whole room');
  });

  it('shows a half booking on the whole Summit but not on the other half', async () => {
    const app = createApp();
    expect((await create(app, booking('rm-summit-a', `${DATE}T13:00`, `${DATE}T14:00`, { title: 'Half A' }))).status).toBe(201);
    expect(await busyTitles(app, 'rm-summit-a')).toContain('Half A');
    expect(await busyTitles(app, 'rm-summit')).toContain('Half A');
    expect(await busyTitles(app, 'rm-summit-b')).not.toContain('Half A');
  });
});

describe('availability cache reuse (recomputations counted as bookings-table reads)', () => {
  it('reuses the cached day for repeated unchanged reads, and recomputes once after a write', async () => {
    const { db, a } = twoReplicas();
    await busyTitles(a, ROOM);
    let reads = 0;
    const restore = watchBookingsQueries(db, () => void reads++);
    try {
      await within(availability(a, ROOM), 'a repeated read');
      await within(availability(a, ROOM), 'a repeated read');
      expect(reads).toBe(0);
    } finally {
      restore();
    }

    expect((await create(a, booking(ROOM, ...SLOT))).status).toBe(201);
    reads = 0;
    const restoreAgain = watchBookingsQueries(db, () => void reads++);
    try {
      await within(availability(a, ROOM), 'the first read after the write');
      await within(availability(a, ROOM), 'a repeated read after the write');
      expect(reads).toBe(1);
    } finally {
      restoreAgain();
    }
  });

  it('keeps a warm cache when a different database is written', async () => {
    const x = createDatabase();
    const y = createDatabase();
    const onX = createApp({ db: x });
    const onY = createApp({ db: y });
    await busyTitles(onY, ROOM);
    let reads = 0;
    const restore = watchBookingsQueries(y, () => void reads++);
    try {
      expect((await create(onX, booking(ROOM, ...SLOT))).status).toBe(201);
      await within(availability(onY, ROOM), 'a read on the other database');
      expect(reads).toBe(0);
    } finally {
      restore();
    }
  });
});

describe('availability cache fill overlapping a write', () => {
  it('a fill that read bookings before a completed create cannot make later reads stale', async () => {
    const { db, a, b } = twoReplicas();
    const held = signal();
    const release = signal();
    const restore = watchBookingsQueries(db, async (n) => {
      if (n === 1) {
        held.fire();
        await release.fired;
      }
    });
    try {
      const fill = availability(a, ROOM);
      await within(held.fired, 'the cache fill to read bookings');
      expect((await create(a, booking(ROOM, ...SLOT, { title: 'Late meeting' }))).status).toBe(201);
      release.fire();
      expect((await within(fill, 'the held cache fill')).status).toBe(200);
    } finally {
      release.fire();
      restore();
    }
    expect(await busyTitles(a, ROOM)).toContain('Late meeting');
    expect(await busyTitles(b, ROOM)).toContain('Late meeting');
  });
});
