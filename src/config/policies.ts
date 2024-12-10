import fs from 'node:fs';
import path from 'node:path';

export interface Policies {
  /** Bookings must start and end on multiples of this. */
  slotMinutes: number;
  maxBookingMinutes: number;
  /** A recurring series may span at most this many days from first to last occurrence. */
  maxSeriesDays: number;
  /**
   * Minimum gap required between consecutive bookings in the same room.
   * Facilities decided against buffers (FAC-12): back-to-back is allowed.
   */
  minGapMinutes: number;
}

export const DEFAULT_POLICIES: Policies = {
  slotMinutes: 15,
  maxBookingMinutes: 10 * 60,
  maxSeriesDays: 366,
  minGapMinutes: 0,
};

export function loadPolicies(): Policies {
  const file = path.resolve(__dirname, '../../config/policies.json');
  if (!fs.existsSync(file)) return DEFAULT_POLICIES;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of Object.keys(raw)) if (k.startsWith('_')) delete raw[k];
  return { ...DEFAULT_POLICIES, ...raw };
}
