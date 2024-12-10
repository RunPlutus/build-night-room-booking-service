import { BookingRecord } from '../db/types';

function icsDate(local: string): string {
  return local.replace(/[-:]/g, '') + '00';
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function rrule(b: BookingRecord): string | null {
  if (!b.recurrence) return null;
  const parts = [`FREQ=${b.recurrence.freq}`];
  if (b.recurrence.interval && b.recurrence.interval > 1) parts.push(`INTERVAL=${b.recurrence.interval}`);
  if (b.recurrence.count) parts.push(`COUNT=${b.recurrence.count}`);
  if (b.recurrence.until) parts.push(`UNTIL=${b.recurrence.until.replace(/-/g, '')}T235959`);
  return parts.join(';');
}

/** RFC 5545 export (floating times; office-local). */
export function toICalendar(bookings: BookingRecord[], roomName: string, stamp = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//room-booking-service//EN', `X-WR-CALNAME:${escape(roomName)}`];
  for (const b of bookings) {
    lines.push('BEGIN:VEVENT', `UID:${b.id}@rooms.internal`, `DTSTAMP:${dtstamp}`, `DTSTART:${icsDate(b.start)}`, `DTEND:${icsDate(b.end)}`, `SUMMARY:${escape(b.title)}`, `ORGANIZER:mailto:${b.organizer}`);
    const r = rrule(b);
    if (r) lines.push(`RRULE:${r}`);
    if (b.status === 'cancelled') lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
