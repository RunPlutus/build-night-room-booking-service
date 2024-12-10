import fs from 'node:fs';
import path from 'node:path';
import { Database } from './Database';
import { Seed } from './types';

export { Database } from './Database';
export type { Queryable } from './Database';

export const DATA_DIR = path.resolve(__dirname, '../../data');

export function loadSeed(dir: string = DATA_DIR): Seed {
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { rooms: read('rooms.json').rooms, bookings: read('bookings.json').bookings };
}

/** Creates a database seeded from data/rooms.json and data/bookings.json. */
export function createDatabase(opts: { seed?: Seed; latencyMs?: number } = {}): Database {
  return new Database(opts.seed ?? loadSeed(), opts.latencyMs ?? Number(process.env.DB_LATENCY_MS ?? 2));
}
