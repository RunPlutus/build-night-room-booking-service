/**
 * Data checks for data/rooms.json and data/bookings.json.
 * Ran in CI until the GitHub Actions migration (see CHANGELOG 1.5.0).
 *
 *   npm run validate:data
 */
import { loadSeed } from '../src/db';

const { rooms, bookings } = loadSeed();
let errors = 0;
let warnings = 0;
const err = (m: string) => (errors++, console.error('ERROR ', m));
const warn = (m: string) => (warnings++, console.warn('WARN  ', m));

const ids = new Set<string>();
for (const r of rooms) {
  if (ids.has(r.id)) err(`duplicate room id ${r.id}`);
  ids.add(r.id);
  if (r.status === 'retired' && !r.replacedBy) warn(`retired room ${r.id} has no replacedBy`);
  if (r.replacedBy && !rooms.some((x) => x.id === r.replacedBy)) err(`${r.id}.replacedBy points at missing room ${r.replacedBy}`);
  if (r.parentId && !rooms.some((x) => x.id === r.parentId)) err(`${r.id}.parentId points at missing room ${r.parentId}`);
  if (r.parentId && r.parentId === r.id) err(`${r.id}.parentId points at itself`);
}

const byId = new Map(rooms.map((r) => [r.id, r]));
for (const r of rooms) {
  const seen = new Set<string>();
  let cur: string | undefined = r.id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  if (cur) err(`${r.id} has a parentId cycle through ${cur}`);
}

const active = rooms.filter((r) => r.status === 'active');
for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    const a = active[i];
    const b = active[j];
    const sameFeatures = JSON.stringify([...(a.features ?? [])].sort()) === JSON.stringify([...(b.features ?? [])].sort());
    if (a.floor === b.floor && a.capacity === b.capacity && sameFeatures) {
      err(`possible duplicate physical room: ${a.id} (${a.name}) and ${b.id} (${b.name}) - same floor, capacity and features`);
    }
  }
}

for (const b of bookings) {
  if (!ids.has(b.roomId)) err(`booking ${b.id} references missing room ${b.roomId}`);
  if (b.end <= b.start) err(`booking ${b.id} ends before it starts`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
