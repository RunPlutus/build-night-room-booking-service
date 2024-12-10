/**
 * Time helpers from the v1 kiosk app. Uses JS Date in host-local time.
 * Still imported by the email reminder templates.
 */
export function toDate(local: string): Date {
  return new Date(local);
}

export function addMinutes(local: string, mins: number): string {
  const d = toDate(local);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString().slice(0, 16);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toDate(aStart) < toDate(bEnd) && toDate(bStart) < toDate(aEnd);
}

export function friendly(local: string): string {
  const d = toDate(local);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000);
}
