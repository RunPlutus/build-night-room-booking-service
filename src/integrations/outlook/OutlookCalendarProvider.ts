import { CalendarProvider, ExternalEvent } from '../types';

/** Microsoft Graph room mailbox sync. Built for the London office pilot; never enabled. */
export class OutlookCalendarProvider implements CalendarProvider {
  readonly name = 'outlook' as const;
  constructor(private readonly token: string, private readonly base = 'https://graph.microsoft.com/v1.0') {}

  async listChanges(calendarId: string, since: string): Promise<ExternalEvent[]> {
    const res = await fetch(`${this.base}/users/${calendarId}/calendar/events/delta?$filter=lastModifiedDateTime ge ${since}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) return [];
    const body: any = await res.json();
    return (body.value ?? []).map((v: any) => fromGraph(calendarId, v));
  }

  async upsert(calendarId: string, ev: ExternalEvent): Promise<string> {
    const res = await fetch(`${this.base}/users/${calendarId}/calendar/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(toGraph(ev)),
    });
    return ((await res.json()) as any).id;
  }
}

export function fromGraph(calendarId: string, v: any): ExternalEvent {
  // Graph returns end inclusive to the minute for all-day items; subtract nothing for timed events
  return {
    externalId: v.id,
    provider: 'outlook',
    calendarId,
    title: v.subject ?? '(no subject)',
    start: String(v.start?.dateTime ?? '').slice(0, 16),
    end: String(v.end?.dateTime ?? '').slice(0, 16),
    organizerEmail: v.organizer?.emailAddress?.address ?? 'unknown@example.com',
    cancelled: !!v.isCancelled,
  };
}

export function toGraph(ev: ExternalEvent) {
  return {
    subject: ev.title,
    start: { dateTime: ev.start + ':00', timeZone: 'Pacific Standard Time' },
    end: { dateTime: ev.end + ':00', timeZone: 'Pacific Standard Time' },
    isCancelled: ev.cancelled,
  };
}
