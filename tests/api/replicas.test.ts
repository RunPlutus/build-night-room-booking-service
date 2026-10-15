import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase } from '../../src/db';
import { metrics } from '../../src/metrics/registry';
import { App, booking, book, availability } from '../helpers/app';

// Two replicas sharing one database, like production.
let a: App;
let b: App;
beforeEach(() => {
  const db = createDatabase();
  a = createApp({ db });
  b = createApp({ db });
});

const titles = (res: request.Response) => res.body.busy.map((x: any) => x.title);
const cacheHits = () => (metrics.snapshot().availability_cache_hit as number | undefined) ?? 0;

describe('concurrent bookings across replicas', () => {
  it('confirms only one of several simultaneous requests for the same slot', async () => {
    const results = await Promise.all(
      [a, b, a, b].map((app, i) => book(app, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00', { title: `Meeting ${i}` }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    const list = await request(a).get('/api/bookings').query({ roomId: 'rm-rainier', from: '2026-11-05', to: '2026-11-05' });
    expect(list.body.occurrences.filter((o: any) => o.status === 'confirmed')).toHaveLength(1);
  });

  it('still confirms simultaneous requests for different slots', async () => {
    const results = await Promise.all([
      book(a, booking('rm-rainier', '2026-11-05T13:00', '2026-11-05T14:00')),
      book(b, booking('rm-rainier', '2026-11-05T16:00', '2026-11-05T17:00')),
      book(b, booking('rm-denali', '2026-11-05T13:00', '2026-11-05T14:00')),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
  });
});

describe('availability across replicas', () => {
  it('shows a booking made on another replica after that replica cached the day', async () => {
    expect(titles(await availability(b, 'rm-kilimanjaro', '2026-11-10'))).toEqual([]);
    await book(a, booking('rm-kilimanjaro', '2026-11-10T13:00', '2026-11-10T17:00', { title: 'Quarterly planning' }));
    expect(titles(await availability(b, 'rm-kilimanjaro', '2026-11-10'))).toEqual(['Quarterly planning']);
  });

  it('frees the room on every replica after a cancellation and keeps the audit record', async () => {
    const created = await book(a, booking('rm-kilimanjaro', '2026-11-10T13:00', '2026-11-10T17:00', { title: 'Quarterly planning' }));
    await availability(a, 'rm-kilimanjaro', '2026-11-10');
    await availability(b, 'rm-kilimanjaro', '2026-11-10');

    await request(a).delete(`/api/bookings/${created.body.id}`).expect(204);

    expect(titles(await availability(a, 'rm-kilimanjaro', '2026-11-10'))).toEqual([]);
    expect(titles(await availability(b, 'rm-kilimanjaro', '2026-11-10'))).toEqual([]);
    const audit = await request(b).get(`/api/bookings/${created.body.id}`).expect(200);
    expect(audit.body).toMatchObject({ id: created.body.id, status: 'cancelled' });
  });

  it('keeps other bookings visible when one is cancelled', async () => {
    const keep = await book(a, booking('rm-kilimanjaro', '2026-11-10T09:00', '2026-11-10T10:00', { title: 'Keep me' }));
    const drop = await book(a, booking('rm-kilimanjaro', '2026-11-10T13:00', '2026-11-10T14:00', { title: 'Drop me' }));
    expect(keep.status).toBe(201);
    await request(b).delete(`/api/bookings/${drop.body.id}`).expect(204);
    expect(titles(await availability(a, 'rm-kilimanjaro', '2026-11-10'))).toEqual(['Keep me']);
  });

  it('serves repeated unchanged reads from the cache', async () => {
    await availability(a, 'rm-kilimanjaro', '2026-11-10');
    const before = cacheHits();
    await availability(a, 'rm-kilimanjaro', '2026-11-10');
    await availability(a, 'rm-kilimanjaro', '2026-11-10');
    expect(cacheHits() - before).toBe(2);
  });
});

describe('renamed room 4B -> Everest', () => {
  it('counts bookings made under the old id as Everest bookings', async () => {
    expect(titles(await availability(a, 'rm-everest', '2026-03-02'))).toContain('Monday all-hands');
    const clash = await book(b, booking('rm-everest', '2026-03-02T10:00', '2026-03-02T11:00', { title: 'Sales sync' }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.details[0]).toMatchObject({ title: 'Monday all-hands' });
  });

  it('keeps the old record for history but does not list or book it as a separate room', async () => {
    const listed = await request(a).get('/api/rooms');
    expect(listed.body.rooms.map((r: any) => r.id)).not.toContain('rm-4b');
    const old = await request(a).get('/api/rooms/rm-4b').expect(200);
    expect(old.body).toMatchObject({ status: 'retired', replacedBy: 'rm-everest' });
    const res = await book(a, booking('rm-4b', '2026-03-02T12:00', '2026-03-02T13:00'));
    expect(res.status).not.toBe(201);
  });

  it('leaves an unrelated room on the same floor independent', async () => {
    const res = await book(a, booking('rm-aconcagua', '2026-03-02T10:00', '2026-03-02T11:00'));
    expect(res.status).toBe(201);
  });
});

describe('Summit divider (ticket 2)', () => {
  const d = '2026-11-12';

  it('blocks both halves while the whole room is booked', async () => {
    expect((await book(a, booking('rm-summit', `${d}T10:00`, `${d}T11:00`, { title: 'Whole room' }))).status).toBe(201);
    const half = await book(b, booking('rm-summit-a', `${d}T10:30`, `${d}T11:30`));
    expect(half.status).toBe(409);
    expect(half.body.error.details[0]).toMatchObject({ title: 'Whole room' });
    expect((await book(a, booking('rm-summit-b', `${d}T09:30`, `${d}T10:30`))).status).toBe(409);
  });

  it('blocks the whole room while either half is booked', async () => {
    expect((await book(a, booking('rm-summit-b', `${d}T13:00`, `${d}T14:00`, { title: 'Half B' }))).status).toBe(201);
    const whole = await book(b, booking('rm-summit', `${d}T13:30`, `${d}T14:30`));
    expect(whole.status).toBe(409);
    expect(whole.body.error.details[0]).toMatchObject({ title: 'Half B' });
  });

  it('lets both halves be booked at the same time', async () => {
    expect((await book(a, booking('rm-summit-a', `${d}T15:00`, `${d}T16:00`))).status).toBe(201);
    expect((await book(b, booking('rm-summit-b', `${d}T15:00`, `${d}T16:00`))).status).toBe(201);
  });

  it('confirms only one of a simultaneous whole-room and half-room request on different replicas', async () => {
    const results = await Promise.all([
      book(a, booking('rm-summit', `${d}T14:00`, `${d}T15:00`)),
      book(b, booking('rm-summit-b', `${d}T14:00`, `${d}T15:00`)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('shows the whole room busy when a half is booked, but not the other half', async () => {
    await book(a, booking('rm-summit-a', `${d}T09:00`, `${d}T10:00`, { title: 'Half A' }));
    expect(titles(await availability(b, 'rm-summit', d))).toEqual(['Half A']);
    expect(titles(await availability(b, 'rm-summit-a', d))).toEqual(['Half A']);
    expect(titles(await availability(b, 'rm-summit-b', d))).toEqual([]);
  });

  it('leaves other rooms on the floor independent of Summit', async () => {
    await book(a, booking('rm-summit', `${d}T10:00`, `${d}T11:00`));
    expect((await book(b, booking('rm-hood', `${d}T10:00`, `${d}T11:00`))).status).toBe(201);
  });
});
