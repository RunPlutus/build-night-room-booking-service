import { Router } from 'express';
import { Container } from '../container/Container';
import { TOKENS } from '../container/tokens';
import { RoomsController } from '../controllers/RoomsController';
import { BookingsController } from '../controllers/BookingsController';
import { handle } from './asyncHandler';
import { metrics } from '../metrics/registry';
import { v1Routes } from '../legacy/v1/routes';
import { adminRoutes } from '../admin/admin.routes';

export function buildRouter(c: Container): Router {
  const cfg = c.resolve(TOKENS.Config);
  const r = Router();
  const rooms = new RoomsController(c.resolve(TOKENS.RoomRepository), c.resolve(TOKENS.AvailabilityService));
  const bookings = new BookingsController(c.resolve(TOKENS.BookingService), c.resolve(TOKENS.BookingQueryService), c.resolve(TOKENS.Policies));

  r.get('/health', (_req, res) => res.json({ status: 'ok' }));
  r.get('/internal/metrics', (_req, res) => res.json(metrics.snapshot()));

  r.get('/api/rooms', handle(rooms.list));
  r.get('/api/rooms/:id', handle(rooms.get));
  r.get('/api/rooms/:id/availability', handle(rooms.availability));

  r.post('/api/bookings', handle(bookings.create));
  r.get('/api/bookings', handle(bookings.list));
  r.get('/api/bookings/:id', handle(bookings.get));
  r.delete('/api/bookings/:id', handle(bookings.cancel));

  r.use('/api/v1', v1Routes());
  if (cfg.features.admin) r.use('/admin', adminRoutes(c));
  return r;
}
