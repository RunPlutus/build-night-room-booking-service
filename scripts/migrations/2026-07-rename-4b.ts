/**
 * FAC-88: 4B gets a proper name for the new wayfinding signs. It's "Everest" now.
 * New record so the signage QR codes can use the new id.
 * Existing bookings will be moved over in a follow-up (FAC-91).
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(__dirname, '../../data/rooms.json');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
doc.rooms.push({
  id: 'rm-everest',
  name: 'Everest',
  floor: 4,
  capacity: 12,
  features: ['display', 'vc', 'whiteboard'],
  status: 'active',
  createdAt: '2026-07-14T00:00:00.000Z',
});
fs.writeFileSync(file, JSON.stringify(doc, null, 2));
console.log('added Everest');
