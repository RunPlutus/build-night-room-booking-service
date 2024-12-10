import request from 'supertest';
import { createApp } from '../../src/app';

export type App = ReturnType<typeof createApp>;

export function freshApp(): App {
  return createApp();
}

export function booking(roomId: string, start: string, end: string, extra: Record<string, unknown> = {}) {
  return { roomId, title: 'Test meeting', organizer: 'tester@example.com', start, end, ...extra };
}

export function book(app: App, body: object) {
  return request(app).post('/api/bookings').send(body);
}

export function availability(app: App, roomId: string, date: string) {
  return request(app).get(`/api/rooms/${roomId}/availability`).query({ date });
}
