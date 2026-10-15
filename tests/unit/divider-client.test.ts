import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadSeed } from '../../src/db';
import { resolveOverlappingRoomIds } from '../../src/repositories/RoomRepository';

describe('official divider calendar and backend agreement', () => {
  it('agrees on every pair of official room identities without changing the supplied client', async () => {
    const source = await readFile(new URL('../../public/room-spaces.js', import.meta.url), 'utf8');
    const client = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const { rooms } = loadSeed();
    const byId = new Map(rooms.map((room) => [room.id, room]));
    for (const first of rooms) {
      const overlapping = new Set(resolveOverlappingRoomIds(first.id, byId));
      for (const second of rooms) {
        expect(client.sameOccupiedSpace(first.id, second.id, rooms), first.id + ' / ' + second.id).toBe(overlapping.has(second.id));
      }
    }
  });
});
