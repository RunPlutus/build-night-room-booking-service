import { describe, it, expect } from 'vitest';
import { SlotGrid } from '../../src/legacy/v1/SlotGrid';
import { SchedulerV1 } from '../../src/legacy/v1/SchedulerV1';
import { parseRule, expandDates } from '../../src/legacy/v1/RecurrenceV1';
import { intervalsOverlap, mergeIntervals, freeGaps, snapTo } from '../../src/utils/dateUtils';
import { toICalendar } from '../../src/export/ical';
import { fromGoogle, toGoogle } from '../../src/integrations/google/GoogleCalendarProvider';
import { fromGraph } from '../../src/integrations/outlook/OutlookCalendarProvider';
import { reminderSubject, reminderHtml } from '../../src/notifications/templates/reminder';
import { t } from '../../src/i18n';
import { AvailabilityCache } from '../../src/cache/AvailabilityCache';
import { TokenBucket } from '../../src/middleware/rateLimit';
import { deepMerge } from '../../src/utils/deepMerge';
import { BookingFromJSON, BookingToJSON, querystring } from '../../src/clients/generated';
import golden from '../fixtures/v1-slotgrid-golden.json';

describe('v1 slot scheduler (retired)', () => {
  it('reserves and blocks', () => {
    const g = new SlotGrid();
    expect(g.reserve('r', '2025-01-06', '10:00', '11:00')).toBe(true);
    expect(g.reserve('r', '2025-01-06', '10:30', '11:00')).toBe(false);
  });
  it('slot index', () => {
    expect(SlotGrid.slotIndex('09:30')).toBe(19);
  });
  it('parses rules', () => {
    expect(parseRule('FREQ=WEEKLY;COUNT=3')).toEqual({ freq: 'WEEKLY', count: 3 });
    expect(parseRule('FREQ=DAILY;UNTIL=20250110').until).toBe('2025-01-10');
  });
  it('expands weekly', () => {
    expect(expandDates('2025-01-06', { freq: 'WEEKLY', count: 3 })).toHaveLength(3);
  });
  it('books all-or-nothing', () => {
    const s = new SchedulerV1();
    expect(s.book({ room: 'r', date: '2025-01-06', from: '10:00', to: '11:00' }).ok).toBe(true);
    expect(s.book({ room: 'r', date: '2025-01-06', from: '13:00', to: '14:00', rrule: 'FREQ=WEEKLY;COUNT=2' }).ok).toBe(true);
  });
  it('matches the golden grid snapshots', () => {
    for (const c of golden.cases) {
      const s = new SchedulerV1();
      for (const b of c.bookings) s.book(b);
      expect(s.view(c.room, c.date)).toBe(c.grid);
    }
  });
});

describe('dateUtils', () => {
  it('half-open overlap', () => {
    expect(intervalsOverlap({ start: 0, end: 60 }, { start: 60, end: 120 })).toBe(false);
    expect(intervalsOverlap({ start: 0, end: 61 }, { start: 60, end: 120 })).toBe(true);
  });
  it('merges', () => {
    expect(mergeIntervals([{ start: 5, end: 9 }, { start: 0, end: 6 }])).toEqual([{ start: 0, end: 9 }]);
  });
  it('gaps', () => {
    expect(freeGaps([{ start: 10, end: 20 }], { start: 0, end: 30 })).toEqual([{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  });
  it('snaps', () => {
    expect(snapTo(17, 15, 'ceil')).toBe(30);
  });
});

describe('integrations + exports', () => {
  const b = { id: 'bk_1', roomId: 'rm-fuji', title: 'A, B; C', organizer: 'x@example.com', start: '2026-11-03T10:00', end: '2026-11-03T11:00', recurrence: { freq: 'WEEKLY' as const, count: 3 }, status: 'confirmed' as const, createdAt: '' };
  it('ical', () => {
    const ics = toICalendar([b], 'Fuji', new Date('2026-01-01T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261103T100000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;COUNT=3');
    expect(ics).toContain('SUMMARY:A\\, B\\; C');
  });
  it('google mapping', () => {
    const ev = fromGoogle('cal', { id: 'g1', summary: 'S', start: { dateTime: '2026-11-03T10:00:00' }, end: { dateTime: '2026-11-03T11:00:00' }, status: 'confirmed' });
    expect(ev.start).toBe('2026-11-03T10:00');
    expect(toGoogle(ev).summary).toBe('S');
  });
  it('graph mapping', () => {
    expect(fromGraph('c', { id: 'o', subject: 'X', isCancelled: true }).cancelled).toBe(true);
  });
  it('reminders', () => {
    expect(reminderSubject({ title: 'Retro', roomName: 'Fuji', start: '', end: '', organizer: '' })).toBe('Reminder: Retro in Fuji');
    expect(reminderHtml({ title: '<x>', roomName: 'Fuji', start: '2026-11-03T10:00', end: '2026-11-03T11:00', organizer: '' })).toContain('&lt;x&gt;');
  });
  it('i18n', () => {
    expect(t('de', 'room.busy', { time: '15:00' })).toBe('Belegt bis 15:00');
    expect(t('fr', 'missing.key')).toBe('missing.key');
  });
});

describe('infrastructure', () => {
  it('availability cache expiry', () => {
    let now = 0;
    const c = new AvailabilityCache(1000, () => now);
    c.set({ roomId: 'r', date: 'd', busy: [] });
    expect(c.get('r', 'd')).toBeDefined();
    now = 2000;
    expect(c.get('r', 'd')).toBeUndefined();
  });
  it('availability cache invalidation by room', () => {
    const c = new AvailabilityCache();
    c.set({ roomId: 'a', date: 'd1', busy: [] });
    c.set({ roomId: 'b', date: 'd1', busy: [] });
    c.invalidateRoom('a');
    expect(c.size()).toBe(1);
  });
  it('token bucket', () => {
    const b = new TokenBucket(1, 1, 0);
    expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(false);
  });
  it('deepMerge', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
  });
  it('generated client', () => {
    const json = { id: 'b', roomId: 'r', title: 't', organizer: 'o', start: 's', end: 'e', status: 'confirmed', createdAt: 'c' };
    expect(BookingToJSON(BookingFromJSON(json))).toMatchObject(json);
    expect(querystring({ date: '2026-11-03' })).toBe('date=2026-11-03');
  });
});
