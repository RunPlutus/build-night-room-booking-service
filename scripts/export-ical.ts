import { createDatabase } from '../src/db';
import { BookingRepository } from '../src/repositories/BookingRepository';
import { RoomRepository } from '../src/repositories/RoomRepository';
import { toICalendar } from '../src/export/ical';

(async () => {
  const roomId = process.argv[2] ?? 'rm-fuji';
  const db = createDatabase();
  const room = await new RoomRepository(db).get(roomId);
  const bookings = await new BookingRepository(db).findByRooms([roomId]);
  process.stdout.write(toICalendar(bookings, room?.name ?? roomId));
})();
