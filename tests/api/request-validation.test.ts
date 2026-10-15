import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshApp } from '../helpers/app';

describe('calendar query input boundaries', () => {
  it.each([
    'date%5B%5D=2026-11-03',
    'date%5BtoString%5D=bad',
    'date=2026-02-30',
  ])('rejects malformed availability query %s with a validation error', async (query) => {
    const response = await request(freshApp()).get('/api/rooms/rm-fuji/availability?' + query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    'roomId%5B%5D=rm-fuji&from=2026-11-03&to=2026-11-03',
    'roomId%5BtoString%5D=bad&from=2026-11-03&to=2026-11-03',
    'roomId=rm-fuji&from%5B%5D=2026-11-03&to=2026-11-03',
  ])('rejects malformed listing query %s with a validation error', async (query) => {
    const response = await request(freshApp()).get('/api/bookings?' + query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
