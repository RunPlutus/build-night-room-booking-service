/** Acceptance examples for the shared engine used by booking and calendar clients. */
export interface SchedulingEngine {
  overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean;
  occurrences(booking: {
    start: string;
    end: string;
    recurrence?: { freq: 'DAILY' | 'WEEKLY'; interval?: number; count?: number; until?: string };
  }): Array<{ start: number; end: number }>;
}

export interface ContractCheck {
  group: 'boundary' | 'series';
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export function runSchedulingContracts(engine: SchedulingEngine): ContractCheck[] {
  const checks: ContractCheck[] = [];
  const check = (group: ContractCheck['group'], label: string, expected: unknown, read: () => unknown) => {
    try {
      const actual = read();
      checks.push({ group, label, expected: JSON.stringify(expected), actual: JSON.stringify(actual), ok: JSON.stringify(actual) === JSON.stringify(expected) });
    } catch (error) {
      checks.push({ group, label, expected: JSON.stringify(expected), actual: error instanceof Error ? error.message : String(error), ok: false });
    }
  };
  const stamp = (value: number) => new Date(value * 60_000).toISOString().slice(0, 16);
  const series = (recurrence: Parameters<SchedulingEngine['occurrences']>[0]['recurrence']) => ({
    start: '2027-01-04T09:30', end: '2027-01-04T10:00', recurrence,
  });
  check('boundary', 'Shared engine allows adjacent meetings', false, () => engine.overlaps({ start: 840, end: 900 }, { start: 900, end: 960 }));
  check('boundary', 'Shared engine allows adjacency in reverse order', false, () => engine.overlaps({ start: 900, end: 960 }, { start: 840, end: 900 }));
  check('boundary', 'Shared engine still detects a real overlap', true, () => engine.overlaps({ start: 840, end: 900 }, { start: 885, end: 945 }));
  check('series', 'Shared engine returns all twelve weekly meetings', 12, () => engine.occurrences(series({ freq: 'WEEKLY', count: 12 })).length);
  check('series', 'Shared engine preserves the final meeting time', ['2027-03-22T09:30', '2027-03-22T10:00'], () => {
    const last = engine.occurrences(series({ freq: 'WEEKLY', count: 12 })).at(-1)!;
    return [stamp(last.start), stamp(last.end)];
  });
  check('series', 'Shared engine includes the final day of a daily series', 10, () => engine.occurrences(series({ freq: 'DAILY', until: '2027-01-13' })).length);
  return checks;
}
