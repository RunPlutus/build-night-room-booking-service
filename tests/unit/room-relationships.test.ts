import { describe, it, expect } from 'vitest';
import { Database } from '../../src/db';
import { RoomRecord } from '../../src/db/types';
import { RoomRepository } from '../../src/repositories/RoomRepository';

const room = (id: string, extra: Partial<RoomRecord> = {}): RoomRecord => ({ id, name: id, floor: 1, capacity: 4, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', ...extra });

const repo = (rooms: RoomRecord[]) => new RoomRepository(new Database({ rooms, bookings: [] }, 0));

describe('RoomRepository.blockingRoomIds', () => {
  const inventory = [
    room('hall'),
    room('hall-a', { parentId: 'hall' }),
    room('hall-b', { parentId: 'hall' }),
    room('hall-b-1', { parentId: 'hall-b' }),
    room('old-hall', { status: 'retired', replacedBy: 'hall' }),
    room('other'),
  ];

  it('includes the room, its aliases and every part of it for the whole room', async () => {
    expect((await repo(inventory).blockingRoomIds('hall')).sort()).toEqual(['hall', 'hall-a', 'hall-b', 'hall-b-1', 'old-hall']);
  });

  it('includes the ancestors but not the siblings for a part', async () => {
    expect((await repo(inventory).blockingRoomIds('hall-a')).sort()).toEqual(['hall', 'hall-a', 'old-hall']);
    expect((await repo(inventory).blockingRoomIds('hall-b-1')).sort()).toEqual(['hall', 'hall-b', 'hall-b-1', 'old-hall']);
  });

  it('resolves the renamed whole room to the same set', async () => {
    expect((await repo(inventory).blockingRoomIds('old-hall')).sort()).toEqual(['hall', 'hall-a', 'hall-b', 'hall-b-1', 'old-hall']);
  });

  it('follows a parent that was itself renamed', async () => {
    const rooms = [room('old-hall', { status: 'retired', replacedBy: 'hall' }), room('hall'), room('wing', { parentId: 'old-hall' })];
    expect((await repo(rooms).blockingRoomIds('hall')).sort()).toEqual(['hall', 'old-hall', 'wing']);
    expect((await repo(rooms).blockingRoomIds('wing')).sort()).toEqual(['hall', 'old-hall', 'wing']);
  });

  it('returns only the room itself when it has no relationships', async () => {
    expect(await repo(inventory).blockingRoomIds('other')).toEqual(['other']);
  });

  it('terminates on a parentId cycle', async () => {
    const rooms = [room('x', { parentId: 'y' }), room('y', { parentId: 'x' })];
    expect((await repo(rooms).blockingRoomIds('x')).sort()).toEqual(['x', 'y']);
  });
});
