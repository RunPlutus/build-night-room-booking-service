import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createDatabase } from '../../src/db';
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

describe('back-to-back bookings', () => {
  it('accepts meetings that start or end exactly when another one does (Fuji)', async () => {
    expect((await book(a, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'))).status).toBe(201);
    expect((await book(b, booking('rm-fuji', '2026-11-03T15:00', '2026-11-03T16:00'))).status).toBe(201);
    expect((await book(a, booking('rm-fuji', '2026-11-03T13:00', '2026-11-03T14:00'))).status).toBe(201);
  });

  it('still rejects a meeting that overlaps by one slot', async () => {
    await book(a, booking('rm-fuji', '2026-11-03T14:00', '2026-11-03T15:00'));
    expect((await book(b, booking('rm-fuji', '2026-11-03T14:45', '2026-11-03T15:45'))).status).toBe(409);
  });

  it('lets each Summit half start as a whole-room meeting ends', async () => {
    expect((await book(a, booking('rm-summit', '2026-11-12T10:00', '2026-11-12T11:00'))).status).toBe(201);
    expect((await book(a, booking('rm-summit-a', '2026-11-12T11:00', '2026-11-12T12:00'))).status).toBe(201);
    expect((await book(b, booking('rm-summit-b', '2026-11-12T11:00', '2026-11-12T12:00'))).status).toBe(201);
    expect((await book(a, booking('rm-summit', '2026-11-12T11:30', '2026-11-12T12:30'))).status).toBe(409);
  });
});

describe('long-running recurring meetings', () => {
  it('shows the weekly Platform standup months after it started and blocks its slot (Fuji)', async () => {
    expect(titles(await availability(a, 'rm-fuji', '2026-10-20'))).toContain('Platform standup');
    const clash = await book(b, booking('rm-fuji', '2026-10-20T09:30', '2026-10-20T10:00', { title: 'Offsite planning' }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.details[0].title).toBe('Platform standup');
  });

  it('shows the Monday all-hands booked under old 4B on Everest late in the series and blocks it', async () => {
    expect(titles(await availability(a, 'rm-everest', '2026-11-02'))).toContain('Monday all-hands');
    expect((await book(b, booking('rm-everest', '2026-11-02T10:00', '2026-11-02T11:00', { title: 'Sales sync' }))).status).toBe(409);
  });

  it('lists every occurrence of a twelve-week series, including the last', async () => {
    const created = await book(a, booking('rm-denali', '2027-01-04T09:30', '2027-01-04T10:00', { recurrence: { freq: 'WEEKLY', count: 12 } }));
    expect(created.status).toBe(201);
    const list = await request(b).get('/api/bookings').query({ roomId: 'rm-denali', from: '2027-01-01', to: '2027-03-31' });
    const mine = list.body.occurrences.filter((o: any) => o.bookingId === created.body.id);
    expect(mine).toHaveLength(12);
    expect(mine.at(-1).start).toBe('2027-03-22T09:30');
  });

  it('includes the final day of a daily series', async () => {
    const created = await book(a, booking('rm-denali', '2027-01-04T09:30', '2027-01-04T10:00', { recurrence: { freq: 'DAILY', until: '2027-01-13' } }));
    expect(created.status).toBe(201);
    expect(titles(await availability(b, 'rm-denali', '2027-01-13'))).toContain('Test meeting');
  });

  it('rejects a new series whose later occurrence clashes with an existing booking', async () => {
    await book(a, booking('rm-denali', '2027-03-22T09:30', '2027-03-22T10:00', { title: 'Late one-off' }));
    const series = await book(b, booking('rm-denali', '2027-01-04T09:30', '2027-01-04T10:00', { recurrence: { freq: 'WEEKLY', count: 12 } }));
    expect(series.status).toBe(409);
    expect(series.body.error.details[0].title).toBe('Late one-off');
  });
});
