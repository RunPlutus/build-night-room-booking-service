import { SlotGrid } from './SlotGrid';
import { expandDates, parseRule } from './RecurrenceV1';

export interface V1Request {
  room: string;
  date: string;
  from: string;
  to: string;
  rrule?: string;
}

export interface V1Result {
  ok: boolean;
  booked: string[];
  failedOn?: string;
}

/** Books every date of a (possibly recurring) request, or none. */
export class SchedulerV1 {
  constructor(private readonly grid = new SlotGrid()) {}

  book(req: V1Request): V1Result {
    const dates = req.rrule ? expandDates(req.date, parseRule(req.rrule)) : [req.date];
    const done: string[] = [];
    for (const d of dates) {
      if (!this.grid.reserve(req.room, d, req.from, req.to)) {
        for (const u of done) this.grid.release(req.room, u, req.from, req.to);
        return { ok: false, booked: [], failedOn: d };
      }
      done.push(d);
    }
    return { ok: true, booked: done };
  }

  view(room: string, date: string): string {
    return this.grid.snapshot(room, date);
  }
}
