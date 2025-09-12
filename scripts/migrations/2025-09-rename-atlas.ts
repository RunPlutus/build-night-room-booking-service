/**
 * FAC-61: Atlas was refurbished and reopened as Olympus.
 * Keep the old record (historical bookings reference it) and point it at the new one.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(__dirname, '../../data/rooms.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
doc.rooms.push({ id: 'rm-olympus', name: 'Olympus', floor: 5, capacity: 16, features: ['display', 'vc'], status: 'active', createdAt: '2025-09-15T00:00:00.000Z' });
const atlas = doc.rooms.find((r: any) => r.id === 'rm-atlas');
atlas.status = 'retired';
atlas.replacedBy = 'rm-olympus';
fs.writeFileSync(file, JSON.stringify(doc, null, 2));
console.log('renamed Atlas -> Olympus');
