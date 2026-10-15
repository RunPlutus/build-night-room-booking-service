import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase, Database, Queryable } from '../../src/db';
import { Tables } from '../../src/db/types';
import { App, booking } from '../helpers/app';

const ROOM = 'rm-rainier';
const START = '2027-02-10T13:00';
const END = '2027-02-10T14:00';
const FAIL_AFTER_MS = 5000;

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
 * Holds the first query that reads the bookings table, after its snapshot is
 * taken and before it returns. It is released by the competing create's next
 * observable step: either its own bookings read, or its request for a
 * transaction, which may only be queued behind the held one.
 */
function holdFirstBookingsRead(db: Database) {
  const firstHeld = signal();
  const release = signal();
  let bookingsReads = 0;
  let transactions = 0;
  const query = db.query.bind(db);
  const transaction = db.transaction.bind(db);

  db.query = async <T,>(fn: (t: Tables) => T): Promise<T> => {
    let readsBookings = false;
    const result = await query((t) =>
      fn(
        new Proxy(t, {
          get(target, key, receiver) {
            if (key === 'bookings') readsBookings = true;
            return Reflect.get(target, key, receiver);
          },
        }),
      ),
    );
    if (readsBookings) {
      bookingsReads += 1;
      if (bookingsReads === 1) {
        firstHeld.fire();
        await release.fired;
      } else {
        release.fire();
      }
    }
    return result;
  };
  db.transaction = <T,>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
    transactions += 1;
    if (transactions > 1) release.fire();
    return transaction(fn);
  };

  return {
    firstHeld: firstHeld.fired,
    restore() {
      release.fire();
      Reflect.deleteProperty(db, 'query');
      Reflect.deleteProperty(db, 'transaction');
    },
  };
}

function create(app: App, body: object) {
  return request(app).post('/api/bookings').send(body).then((res) => res);
}

function confirmedAtStart(db: Database): Promise<number> {
  return db.query((t) => [...t.bookings.values()].filter((b) => b.roomId === ROOM && b.start === START && b.status === 'confirmed').length);
}

function twoReplicas() {
  const db = createDatabase();
  return { db, a: createApp({ db }), b: createApp({ db }) };
}

describe('concurrent creates across instances sharing one database', () => {
  it('lets one of two identical creates win when the second starts before the first is stored', async () => {
    const { db, a, b } = twoReplicas();
    const gate = holdFirstBookingsRead(db);
    try {
      const first = create(a, booking(ROOM, START, END, { title: 'Customer call' }));
      await within(gate.firstHeld, 'the first create to read bookings');
      const second = create(b, booking(ROOM, START, END, { title: 'Interview loop' }));
      const results = await within(Promise.all([first, second]), 'both creates to respond');

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.error.code).toBe('CONFLICT');
    } finally {
      gate.restore();
    }
    expect(await confirmedAtStart(db)).toBe(1);
  });

  it('stores one booking when four identical creates arrive through both instances at once', async () => {
    const { db, a, b } = twoReplicas();
    const results = await within(
      Promise.all([a, b, a, b].map((app, i) => create(app, booking(ROOM, START, END, { title: `Contender ${i + 1}` })))),
      'all creates to respond',
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'CONFLICT')).toBe(true);
    expect(await confirmedAtStart(db)).toBe(1);
  });

  it('accepts a later valid create after rejected ones', async () => {
    const { a, b } = twoReplicas();
    expect((await within(create(a, booking(ROOM, START, END)), 'the first create')).status).toBe(201);

    const conflict = await within(create(b, booking(ROOM, START, END)), 'the conflicting create');
    expect(conflict.status).toBe(409);
    const retired = await within(create(a, booking('rm-atlas', START, END)), 'the retired-room create');
    expect(retired.body.error.code).toBe('ROOM_RETIRED');

    const later = await within(create(b, booking(ROOM, '2027-02-10T15:00', '2027-02-10T16:00')), 'the later create');
    expect(later.status).toBe(201);
  });

  it('lets only one of a whole-Summit create and a Summit B create win when they overlap in time', async () => {
    const { db, a, b } = twoReplicas();
    const start = '2027-03-03T14:00';
    const gate = holdFirstBookingsRead(db);
    try {
      const whole = create(a, booking('rm-summit', start, '2027-03-03T15:00', { title: 'Whole-room offsite' }));
      await within(gate.firstHeld, 'the whole-room create to read bookings');
      const half = create(b, booking('rm-summit-b', start, '2027-03-03T15:00', { title: 'Half-room interview' }));
      const results = await within(Promise.all([whole, half]), 'both creates to respond');

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.error.code).toBe('CONFLICT');
    } finally {
      gate.restore();
    }
    const stored = await db.query(
      (t) => [...t.bookings.values()].filter((x) => ['rm-summit', 'rm-summit-b'].includes(x.roomId) && x.start === start && x.status === 'confirmed').length,
    );
    expect(stored).toBe(1);
  });
});
