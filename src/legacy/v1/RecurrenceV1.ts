/**
 * v1 recurrence: RRULE-ish strings, e.g. "FREQ=WEEKLY;COUNT=10" or
 * "FREQ=DAILY;UNTIL=20261231". Weekends were skipped for DAILY (v2 doesn't).
 */
export interface RuleV1 {
  freq: 'DAILY' | 'WEEKLY';
  count?: number;
  until?: string;
}

export function parseRule(rule: string): RuleV1 {
  const parts = Object.fromEntries(rule.split(';').map((kv) => kv.split('=')));
  const freq = parts.FREQ as RuleV1['freq'];
  if (freq !== 'DAILY' && freq !== 'WEEKLY') throw new Error(`unsupported FREQ ${parts.FREQ}`);
  const out: RuleV1 = { freq };
  if (parts.COUNT) out.count = Number(parts.COUNT);
  if (parts.UNTIL) out.until = `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`;
  return out;
}

export function expandDates(firstDate: string, rule: RuleV1, max = 52): string[] {
  const out: string[] = [];
  const d = new Date(firstDate + 'T00:00:00');
  while (out.length < (rule.count ?? max)) {
    const iso = d.toISOString().slice(0, 10);
    if (rule.until && iso > rule.until) break;
    const dow = d.getDay();
    if (rule.freq === 'WEEKLY' || (dow !== 0 && dow !== 6)) out.push(iso);
    d.setDate(d.getDate() + (rule.freq === 'WEEKLY' ? 7 : 1));
  }
  return out;
}
