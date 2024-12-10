import { Request, Response } from 'express';
import { BookingService } from '../services/BookingService';
import { BookingQueryService } from '../services/BookingQueryService';
import { validateBookingInput } from '../services/BookingValidator';
import { Policies } from '../config/policies';
import { ValidationError } from '../errors';

export class BookingsController {
  constructor(
    private readonly service: BookingService,
    private readonly query: BookingQueryService,
    private readonly policies: Policies,
  ) {}

  /** POST /api/bookings */
  create = async (req: Request, res: Response) => {
    const input = validateBookingInput(req.body, this.policies);
    const booking = await this.service.create(input);
    res.status(201).location(`/api/bookings/${booking.id}`).json(booking);
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(req.params.id));
  };

  /** DELETE /api/bookings/:id — cancels (soft delete) */
  cancel = async (req: Request, res: Response) => {
    await this.service.cancel(req.params.id);
    res.status(204).end();
  };

  /** GET /api/bookings?roomId=&from=YYYY-MM-DD&to=YYYY-MM-DD */
  list = async (req: Request, res: Response) => {
    const { roomId, from, to } = req.query as Record<string, string | undefined>;
    if (!roomId || !from || !to) throw new ValidationError('roomId, from and to are required');
    res.json({ roomId, occurrences: await this.query.between(roomId, from, to) });
  };
}
