import { Request, Response } from 'express';
import { RoomRepository } from '../repositories/RoomRepository';
import { AvailabilityService } from '../services/AvailabilityService';
import { NotFoundError, ValidationError } from '../errors';

export class RoomsController {
  constructor(private readonly rooms: RoomRepository, private readonly availabilitySvc: AvailabilityService) {}

  list = async (req: Request, res: Response) => {
    const includeRetired = req.query.includeRetired === 'true';
    const rooms = (await this.rooms.list()).filter((r) => includeRetired || r.status === 'active');
    res.json({ rooms });
  };

  get = async (req: Request, res: Response) => {
    const room = await this.rooms.get(req.params.id);
    if (!room) throw new NotFoundError(`Room ${req.params.id}`);
    res.json(room);
  };

  /** GET /api/rooms/:id/availability?date=YYYY-MM-DD */
  availability = async (req: Request, res: Response) => {
    const date = String(req.query.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('date must be YYYY-MM-DD');
    res.json(await this.availabilitySvc.forDay(req.params.id, date));
  };
}
