import { describe, expect, it } from 'vitest';
import { Database } from '../../src/db/Database';
import { BookingRecord, RoomRecord } from '../../src/db/types';
import { BookingRepository } from '../../src/repositories/BookingRepository';
import { RoomRepository, resolveOverlappingRoomIds, validateRoomSpaces } from '../../src/repositories/RoomRepository';

const room = (id: string, extra: Partial<RoomRecord> = {}): RoomRecord => ({
  id, name: id, floor: 6, capacity: 14, status: 'active', createdAt: '2026-10-19T00:00:00.000Z', ...extra,
});
const spaces = (): RoomRecord[] => [
  room('whole'), room('a', { parentId: 'whole' }), room('b', { parentId: 'whole' }), room('other'),
];
const byId = (rooms: RoomRecord[]) => new Map(rooms.map((r) => [r.id, r]));
const booking = (id: string, roomId: string): BookingRecord => ({
  id, roomId, title: id, organizer: 'a@example.com', start: '2026-10-20T10:00', end: '2026-10-20T11:00',
  recurrence: null, status: 'confirmed', createdAt: '2026-10-14T00:00:00.000Z',
});
const revisions = (repo: BookingRepository) => Promise.all(['whole', 'a', 'b', 'other'].map((id) => repo.revision(id)));

describe('pairwise divider spaces', () => {
  it('overlaps whole and each half symmetrically without making sibling halves overlap', async () => {
    const repo = new RoomRepository(new Database({ rooms: spaces(), bookings: [] }, 0));
    expect(await repo.overlappingRoomIds('whole')).toEqual(['whole', 'a', 'b']);
    expect(await repo.overlappingRoomIds('a')).toEqual(['whole', 'a']);
    expect(await repo.overlappingRoomIds('b')).toEqual(['whole', 'b']);
    expect(await repo.overlappingRoomIds('other')).toEqual(['other']);
    expect(await repo.physicalRoomIds('a')).toEqual(['a']);
  });

  it('supports descendants without connecting cousins through a common ancestor', () => {
    const rooms = byId([...spaces(), room('a1', { parentId: 'a' }), room('a2', { parentId: 'a' })]);
    expect(resolveOverlappingRoomIds('a1', rooms)).toEqual(['whole', 'a', 'a1']);
    expect(resolveOverlappingRoomIds('a', rooms)).toEqual(['whole', 'a', 'a1', 'a2']);
  });

  it('inherits parent metadata from a retired child alias and canonicalizes parent aliases', async () => {
    const rooms = [
      room('old-whole', { status: 'retired', replacedBy: 'whole' }), room('whole'),
      room('old-a', { status: 'retired', replacedBy: 'a', parentId: 'old-whole' }), room('a'),
      room('b', { parentId: 'whole' }),
    ];
    const repo = new RoomRepository(new Database({ rooms, bookings: [] }, 0));
    expect(await repo.physicalRoomIds('old-a')).toEqual(['old-a', 'a']);
    expect(await repo.overlappingRoomIds('a')).toEqual(['old-whole', 'whole', 'old-a', 'a']);
    expect(await repo.overlappingRoomIds('old-whole')).toEqual(rooms.map((r) => r.id));
  });

  it('accepts equivalent explicit parent links across renamed aliases', () => {
    const rooms = byId([
      room('old-whole', { status: 'retired', replacedBy: 'whole' }), room('whole'),
      room('old-a', { status: 'retired', replacedBy: 'a', parentId: 'old-whole' }), room('a', { parentId: 'whole' }),
    ]);
    expect(() => validateRoomSpaces(rooms)).not.toThrow();
  });

  it.each([
    ['missing parent', [room('a', { parentId: 'missing' })], /parent|missing/i],
    ['direct cycle', [room('a', { parentId: 'b' }), room('b', { parentId: 'a' })], /cycle/i],
    ['canonical self cycle', [room('old', { status: 'retired', replacedBy: 'a' }), room('a', { parentId: 'old' })], /cycle/i],
    ['inconsistent alias parents', [room('p'), room('q'), room('old', { status: 'retired', replacedBy: 'a', parentId: 'p' }), room('a', { parentId: 'q' })], /inconsistent|parent/i],
    ['empty parent', [room('a', { parentId: '' })], /parent/i],
  ] as const)('rejects %s', (_name, rooms, message) => {
    expect(() => validateRoomSpaces(byId([...rooms]))).toThrow(message);
  });

  it('still rejects broken replacement graphs before calculating overlap', () => {
    expect(() => validateRoomSpaces(byId([room('old', { status: 'retired', replacedBy: 'missing' })]))).toThrow(/missing/i);
    expect(() => validateRoomSpaces(byId([room('a', { replacedBy: 'b' }), room('b', { replacedBy: 'a' })]))).toThrow(/cycle/i);
  });
});

describe('atomic divider view revisions', () => {
  it.each<[string, number[]]>([
    ['whole', [1, 1, 1, 0]], ['a', [1, 1, 0, 0]], ['b', [1, 0, 1, 0]],
  ])('advances exactly the views affected by a %s booking', async (id, expected) => {
    const repo = new BookingRepository(new Database({ rooms: spaces(), bookings: [] }, 0));
    await repo.insert(booking('meeting', id));
    expect(await revisions(repo)).toEqual(expected);
    await repo.updateStatus('meeting', 'cancelled', '2026-10-20T09:00:00Z');
    expect(await revisions(repo)).toEqual(expected.map((n) => n * 2));
    const cancelled = await repo.get('meeting');
    await repo.updateStatus('meeting', 'cancelled', '2026-10-21T09:00:00Z');
    expect(await revisions(repo)).toEqual(expected.map((n) => n * 2));
    expect(await repo.get('meeting')).toEqual(cancelled);
  });

  it('deduplicates renamed views, preserving stored historical booking identity', async () => {
    const rooms = [...spaces(), room('old-whole', { status: 'retired', replacedBy: 'whole' }), room('old-a', { status: 'retired', replacedBy: 'a' })];
    const db = new Database({ rooms, bookings: [] }, 0);
    const repo = new BookingRepository(db);
    await repo.insert(booking('historical', 'old-a'));
    expect(await revisions(repo)).toEqual([1, 1, 0, 0]);
    expect(await repo.revision('old-whole')).toBe(0);
    expect(await repo.revision('old-a')).toBe(0);
    const ids = await new RoomRepository(db).overlappingRoomIds('whole');
    expect(await repo.snapshotByRooms(ids, 'whole')).toMatchObject({ revision: 1, bookings: [{ id: 'historical', roomId: 'old-a' }] });
  });

  it('rolls back all dependent revisions and rows with the enclosing transaction', async () => {
    const db = new Database({ rooms: spaces(), bookings: [] }, 0);
    const repo = new BookingRepository(db);
    await expect(db.transaction(async (tx) => {
      await repo.insert(booking('aborted', 'whole'), tx);
      expect(await Promise.all(['whole', 'a', 'b'].map((id) => repo.revision(id, tx)))).toEqual([1, 1, 1]);
      throw new Error('rollback divider');
    })).rejects.toThrow('rollback divider');
    expect(await revisions(repo)).toEqual([0, 0, 0, 0]);
    expect(await repo.count()).toBe(0);
  });

  it('rejects invalid graph mutations without publishing rows or revisions', async () => {
    const repo = new BookingRepository(new Database({ rooms: [room('a', { parentId: 'missing' })], bookings: [] }, 0));
    await expect(repo.insert(booking('invalid', 'a'))).rejects.toThrow(/parent|missing/i);
    expect(await repo.count()).toBe(0);
    expect(await repo.revision('a')).toBe(0);
  });
});
