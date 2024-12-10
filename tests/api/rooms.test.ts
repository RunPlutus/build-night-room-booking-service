import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { App, freshApp, booking, book, availability } from '../helpers/app';

let app: App;
beforeEach(() => {
  app = freshApp();
});

describe('rooms', () => {


  it('gets one room', async () => {
    const res = await request(app).get('/api/rooms/rm-summit');
    expect(res.body.capacity).toBe(30);
  });
});

describe('availability', () => {
  it('shows a new booking', async () => {
    await book(app, booking('rm-rainier', '2026-11-03T10:00', '2026-11-03T11:00', { title: 'Planning' }));
    const res = await availability(app, 'rm-rainier', '2026-11-03');
    expect(res.body.busy).toEqual([expect.objectContaining({ title: 'Planning', start: '2026-11-03T10:00', end: '2026-11-03T11:00' })]);
  });

  it('refreshes after a new booking (cache invalidation)', async () => {
    await book(app, booking('rm-rainier', '2026-11-03T10:00', '2026-11-03T11:00'));
    await availability(app, 'rm-rainier', '2026-11-03');
    await book(app, booking('rm-rainier', '2026-11-03T13:00', '2026-11-03T14:00'));
    const res = await availability(app, 'rm-rainier', '2026-11-03');
    expect(res.body.busy).toHaveLength(2);
  });

  it('shows recurring meetings', async () => {
    const res = await availability(app, 'rm-fuji', '2026-07-14');
    expect(res.body.busy.map((b: any) => b.title)).toContain('Platform standup');
  });


  it('validates the date', async () => {
    await availability(app, 'rm-fuji', 'tomorrow').expect(400);
  });
});

describe('misc routes', () => {
  it('health', async () => {
    await request(app).get('/health').expect(200);
  });
  it('v1 is gone', async () => {
    const res = await request(app).get('/api/v1/book');
    expect(res.status).toBe(410);
  });
  it('404 for unknown routes', async () => {
    await request(app).get('/nope').expect(404);
  });
});
