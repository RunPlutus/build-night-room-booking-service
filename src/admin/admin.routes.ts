import { Router } from 'express';
import { Container } from '../container/Container';
import { TOKENS } from '../container/tokens';
import { handle } from '../routes/asyncHandler';

/** Facilities admin console (FAC-30). Read-only; room edits go through data/rooms.json + deploy. */
export function adminRoutes(c: Container): Router {
  const r = Router();
  const rooms = c.resolve(TOKENS.RoomRepository);
  const bookings = c.resolve(TOKENS.BookingRepository);
  const cache = c.resolve(TOKENS.AvailabilityCache);
  r.get(
    '/',
    handle(async (_req, res) => {
      const list = await rooms.list();
      const rows = list.map((x) => `<tr><td>${x.id}</td><td>${x.name}</td><td>${x.floor}</td><td>${x.capacity}</td><td>${x.status}</td></tr>`).join('');
      res.type('html').send(`<!doctype html><title>Rooms admin</title><h1>Rooms</h1><table>${rows}</table><p>${await bookings.count()} bookings</p>`);
    }),
  );
  r.post('/cache/flush', (_req, res) => {
    cache.clear();
    res.status(204).end();
  });
  r.put('/rooms/:id', (_req, res) => res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Edit data/rooms.json and deploy' } }));
  return r;
}
