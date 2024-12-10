import { createApp } from './app';
import { loadConfig } from './config';
import { logger } from './logging/logger';
import { startReminderLoop } from './notifications/reminders';
import { startCalendarSync } from './integrations/syncRunner';

const cfg = loadConfig();
const app = createApp();
if (cfg.features.emailReminders) startReminderLoop();
if (cfg.features.calendarSync) startCalendarSync();
app.listen(cfg.port, () => logger.info('room-booking-service listening', { port: cfg.port }));
