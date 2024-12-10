import { CalendarProvider, ExternalEvent } from '../types';
import { logger } from '../../logging/logger';

/**
 * Two-way sync with Google room resources (CAL-40). Paused after the
 * resource-calendar quota incident; feature flag calendarSync is off in dev.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google' as const;
  constructor(private readonly token: string, private readonly base = 'https://www.googleapis.com/calendar/v3') {}

  async listChanges(calendarId: string, since: string): Promise<ExternalEvent[]> {
    const url = `${this.base}/calendars/${encodeURIComponent(calendarId)}/events?updatedMin=${encodeURIComponent(since)}&singleEvents=false`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}` } });
    if (!res.ok) {
      logger.warn('google listChanges failed', { status: res.status });
      return [];
    }
    const body: any = await res.json();
    return (body.items ?? []).map((it: any) => fromGoogle(calendarId, it));
  }

  async upsert(calendarId: string, ev: ExternalEvent): Promise<string> {
    const res = await fetch(`${this.base}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(toGoogle(ev)),
    });
    const body: any = await res.json();
    return body.id;
  }
}

export function fromGoogle(calendarId: string, it: any): ExternalEvent {
  return {
    externalId: it.id,
    provider: 'google',
    calendarId,
    title: it.summary ?? '(no title)',
    start: String(it.start?.dateTime ?? '').slice(0, 16),
    end: String(it.end?.dateTime ?? '').slice(0, 16),
    organizerEmail: it.organizer?.email ?? 'unknown@example.com',
    cancelled: it.status === 'cancelled',
    recurrenceRule: it.recurrence?.[0]?.replace(/^RRULE:/, ''),
  };
}

export function toGoogle(ev: ExternalEvent) {
  return {
    summary: ev.title,
    start: { dateTime: ev.start + ':00' },
    end: { dateTime: ev.end + ':00' },
    recurrence: ev.recurrenceRule ? [`RRULE:${ev.recurrenceRule}`] : undefined,
    status: ev.cancelled ? 'cancelled' : 'confirmed',
  };
}
