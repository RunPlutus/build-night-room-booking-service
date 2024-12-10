export interface ExternalEvent {
  externalId: string;
  provider: 'google' | 'outlook';
  calendarId: string;
  title: string;
  start: string;
  end: string;
  organizerEmail: string;
  cancelled: boolean;
  recurrenceRule?: string;
}

export interface CalendarProvider {
  readonly name: ExternalEvent['provider'];
  listChanges(calendarId: string, since: string): Promise<ExternalEvent[]>;
  upsert(calendarId: string, ev: ExternalEvent): Promise<string>;
}
