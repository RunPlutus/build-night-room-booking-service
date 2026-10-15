import { describe, expect, it } from 'vitest';
import { AvailabilityCache, CachedDay } from '../../src/cache/AvailabilityCache';

const day: CachedDay = { roomId: 'r', date: '2026-10-15', busy: [{ bookingId: 'b', title: 'Meeting', start: '2026-10-15T10:00', end: '2026-10-15T11:00' }] };

describe('versioned availability cache', () => {
  it('matches the authoritative revision and rejects late older fills', () => {
    const cache = new AvailabilityCache();
    cache.set(day, 2);
    expect(cache.get('r', day.date, 1)).toBeUndefined();
    expect(cache.get('r', day.date, 2)).toEqual(day);
    cache.set({ ...day, busy: [] }, 1);
    expect(cache.get('r', day.date, 2)).toEqual(day);
    expect(cache.get('r', day.date, 3)).toBeUndefined();
  });

  it('preserves legacy calls, TTL, defensive copying, invalidation, and clear', () => {
    let now = 0;
    const cache = new AvailabilityCache(100, () => now);
    const input = structuredClone(day);
    cache.set(input);
    input.busy.length = 0;
    const hit = cache.get('r', day.date)!;
    hit.busy[0].title = 'changed';
    expect(cache.get('r', day.date)).toEqual(day);
    now = 101;
    expect(cache.get('r', day.date)).toBeUndefined();
    cache.set(day);
    cache.set({ ...day, roomId: 'other' });
    cache.invalidateRoom('r');
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
