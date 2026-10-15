import { describe, expect, it } from 'vitest';
import { validateBookingInput } from '../../src/services/BookingValidator';
import { loadPolicies } from '../../src/config/policies';

const input = {
  roomId: 'rm-fuji', title: 'Planning', organizer: 'test@example.com',
  start: '2027-01-04T09:00', end: '2027-01-04T10:00',
};

describe('recurrence validation before complete expansion', () => {
  it.each([1.5, '2', NaN])('rejects an invalid count %s', (count) => {
    expect(() => validateBookingInput({ ...input, recurrence: { freq: 'DAILY', count } }, loadPolicies())).toThrow();
  });

  it.each([0, -1, 1.5, '2', NaN, Infinity])('rejects invalid count %s even with an until date', (count) => {
    expect(() => validateBookingInput({
      ...input, recurrence: { freq: 'DAILY', count, until: '2027-01-08' },
    }, loadPolicies())).toThrow();
  });

  it('preserves the 366-day policy boundary', () => {
    expect(validateBookingInput({ ...input, recurrence: { freq: 'DAILY', count: 367 } }, loadPolicies()).recurrence?.count).toBe(367);
    expect(() => validateBookingInput({ ...input, recurrence: { freq: 'DAILY', count: 368 } }, loadPolicies())).toThrow('366');
  });
});
