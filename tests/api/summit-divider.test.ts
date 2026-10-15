import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book } from '../helpers/app';

const DAY = '2027-03-03';
const at = (from: string, to: string) => [`${DAY}T${from}`, `${DAY}T${to}`] as const;

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('Summit divider (whole room and its two halves)', () => {
  it.each(['rm-summit-a', 'rm-summit-b'])('a whole-Summit booking blocks %s', async (half) => {
    expect((await book(app, booking('rm-summit', ...at('10:00', '11:00')))).status).toBe(201);
    const res = await book(app, booking(half, ...at('10:00', '11:00')));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it.each(['rm-summit-a', 'rm-summit-b'])('a %s booking blocks the whole Summit', async (half) => {
    expect((await book(app, booking(half, ...at('10:00', '11:00')))).status).toBe(201);
    const res = await book(app, booking('rm-summit', ...at('10:30', '11:30')));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('allows Summit A and Summit B at the same time', async () => {
    expect((await book(app, booking('rm-summit-a', ...at('10:00', '11:00')))).status).toBe(201);
    expect((await book(app, booking('rm-summit-b', ...at('10:00', '11:00')))).status).toBe(201);
  });

  it('keeps an unrelated room bookable while all of Summit is taken', async () => {
    expect((await book(app, booking('rm-summit', ...at('10:00', '11:00')))).status).toBe(201);
    expect((await book(app, booking('rm-rainier', ...at('10:00', '11:00')))).status).toBe(201);
  });

  it('frees both halves after the whole-Summit booking is cancelled', async () => {
    const whole = await book(app, booking('rm-summit', ...at('10:00', '11:00')));
    await request(app).delete(`/api/bookings/${whole.body.id}`).expect(204);
    expect((await book(app, booking('rm-summit-a', ...at('10:00', '11:00')))).status).toBe(201);
    expect((await book(app, booking('rm-summit-b', ...at('10:00', '11:00')))).status).toBe(201);
  });
});
