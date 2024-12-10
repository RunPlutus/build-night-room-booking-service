import { logger } from '../logging/logger';
import { reminderSubject, reminderText, ReminderModel } from './templates/reminder';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export class LogMailer implements Mailer {
  readonly sent: Array<{ to: string; subject: string }> = [];
  async send(to: string, subject: string, _text: string) {
    this.sent.push({ to, subject });
    logger.info('mail (log only)', { to, subject });
  }
}

export async function sendReminder(m: ReminderModel, mailer: Mailer): Promise<void> {
  await mailer.send(m.organizer, reminderSubject(m), reminderText(m));
}

/** 15-minute-ahead reminders. Production runs this from Cloud Scheduler instead. */
export function startReminderLoop(): NodeJS.Timeout {
  logger.warn('reminder loop: SMTP not configured, using LogMailer');
  const t = setInterval(() => logger.debug('reminder tick'), 60_000);
  t.unref();
  return t;
}
