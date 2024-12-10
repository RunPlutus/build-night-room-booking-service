import { friendly, minutesBetween } from '../../lib/legacyTime';

export interface ReminderModel {
  title: string;
  roomName: string;
  start: string;
  end: string;
  organizer: string;
}

export function reminderSubject(m: ReminderModel): string {
  return `Reminder: ${m.title} in ${m.roomName}`;
}

export function reminderText(m: ReminderModel): string {
  return [
    `Hi,`,
    ``,
    `Your meeting "${m.title}" starts ${friendly(m.start)} in ${m.roomName}.`,
    `It runs for ${minutesBetween(m.start, m.end)} minutes.`,
    ``,
    `Not using the room? Cancel it so others can: https://rooms.internal/bookings`,
  ].join('\n');
}

export function reminderHtml(m: ReminderModel): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<p>Your meeting <strong>${esc(m.title)}</strong> starts ${esc(friendly(m.start))} in ${esc(m.roomName)}.</p>
<p><a href="https://rooms.internal/bookings">Cancel it</a> if you no longer need the room.</p>`;
}
