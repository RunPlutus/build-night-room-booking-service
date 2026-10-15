import { describe, expect, it } from 'vitest';
import { Database } from '../../src/db/Database';
import { RoomRecord } from '../../src/db/types';
import { loadSeed } from '../../src/db';
import { RoomRepository, resolveCanonical } from '../../src/repositories/RoomRepository';

const room = (id: string, replacedBy?: string): RoomRecord => ({
  id, name: id, floor: 1, capacity: 4, createdAt: '2026-01-01T00:00:00.000Z',
  status: replacedBy ? 'retired' : 'active', ...(replacedBy ? { replacedBy } : {}),
});

describe('physical room identity', () => {
  it('preserves old room records and booking references for the 4B rename', () => {
    const seed = loadSeed();
    expect(seed.rooms.find((r) => r.id === 'rm-4b')).toMatchObject({
      status: 'retired', replacedBy: 'rm-everest',
    });
    expect(seed.bookings.find((b) => b.id === 'bk_allhands')?.roomId).toBe('rm-4b');
    expect(seed.bookings).toHaveLength(920);
  });

  it('resolves every alias in a chain longer than ten renames', async () => {
    const rooms = Array.from({ length: 13 }, (_, i) => room('room-' + i, i < 12 ? 'room-' + (i + 1) : undefined));
    const repository = new RoomRepository(new Database({ rooms, bookings: [] }, 0));
    expect(await repository.canonicalId('room-0')).toBe('room-12');
    expect(await repository.physicalRoomIds('room-12')).toEqual(rooms.map((r) => r.id));
  });

  it('rejects replacement cycles instead of choosing an arbitrary room', () => {
    const rooms = [room('a', 'b'), room('b', 'a')];
    expect(() => resolveCanonical('a', new Map(rooms.map((r) => [r.id, r])))).toThrow(/cycle/i);
  });

  it('rejects missing replacement targets', () => {
    expect(() => resolveCanonical('a', new Map([['a', room('a', 'missing')]]))).toThrow(/missing/i);
  });
});
