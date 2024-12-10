import { ValidationError } from '../errors';
import { parseLocal, parseDate, MINUTES_PER_DAY } from '../scheduling/time';
import { Recurrence, stepMinutes } from '../scheduling/recurrence';
import { Policies } from '../config/policies';

export interface BookingInput {
  roomId: string;
  title: string;
  organizer: string;
  start: string;
  end: string;
  recurrence?: Recurrence | null;
}

export function validateBookingInput(body: any, policies: Policies): BookingInput {
  if (!body || typeof body !== 'object') throw new ValidationError('body must be a JSON object');
  const { roomId, title, organizer, start, end, recurrence } = body;
  if (typeof roomId !== 'string' || !roomId) throw new ValidationError('roomId is required');
  if (typeof title !== 'string' || !title.trim()) throw new ValidationError('title is required');
  if (title.length > 120) throw new ValidationError('title is too long');
  if (typeof organizer !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(organizer)) {
    throw new ValidationError('organizer must be an email address');
  }
  const s = parseLocal(start);
  const e = parseLocal(end);
  if (e <= s) throw new ValidationError('end must be after start');
  if (s % policies.slotMinutes !== 0 || e % policies.slotMinutes !== 0) {
    throw new ValidationError(`start and end must be on ${policies.slotMinutes}-minute boundaries`);
  }
  if (e - s > policies.maxBookingMinutes) throw new ValidationError('booking is too long');

  let rec: Recurrence | null = null;
  if (recurrence != null) {
    if (recurrence.freq !== 'DAILY' && recurrence.freq !== 'WEEKLY') throw new ValidationError('recurrence.freq must be DAILY or WEEKLY');
    if (recurrence.interval != null && (!Number.isInteger(recurrence.interval) || recurrence.interval < 1)) {
      throw new ValidationError('recurrence.interval must be a positive integer');
    }
    if (recurrence.until == null && recurrence.count == null) throw new ValidationError('recurrence needs until or count');
    if (e - s > MINUTES_PER_DAY) throw new ValidationError('recurring bookings must be shorter than a day');
    const span =
      recurrence.until != null
        ? parseDate(recurrence.until) - s
        : (Number(recurrence.count) - 1) * stepMinutes(recurrence as Recurrence);
    if (span < 0) throw new ValidationError('recurrence ends before it starts');
    if (span > policies.maxSeriesDays * MINUTES_PER_DAY) {
      throw new ValidationError(`recurring series may span at most ${policies.maxSeriesDays} days`);
    }
    rec = { freq: recurrence.freq, interval: recurrence.interval, until: recurrence.until, count: recurrence.count };
    for (const k of Object.keys(rec) as Array<keyof Recurrence>) if (rec[k] === undefined) delete rec[k];
  }
  return { roomId, title: title.trim(), organizer, start, end, recurrence: rec };
}
