/**
 * In-process metrics registry. Flushed to StatsD by metrics/statsdExporter.ts
 * when STATSD_HOST is configured; otherwise values are buffered and exposed
 * at /internal/metrics.
 */
type Counter = { kind: 'counter'; value: number };
type Histogram = { kind: 'histogram'; values: number[] };

const store = new Map<string, Counter | Histogram>();
const MAX_SAMPLES = 1000;

export const metrics = {
  increment(name: string, by = 1): void {
    const m = store.get(name);
    if (m && m.kind === 'counter') m.value += by;
    else store.set(name, { kind: 'counter', value: by });
  },
  observe(name: string, value: number): void {
    let m = store.get(name);
    if (!m || m.kind !== 'histogram') {
      m = { kind: 'histogram', values: [] };
      store.set(name, m);
    }
    m.values.push(value);
    if (m.values.length > MAX_SAMPLES) m.values.shift();
  },
  timer(name: string): () => number {
    const t0 = performance.now();
    return () => {
      const ms = performance.now() - t0;
      metrics.observe(name, ms);
      return ms;
    };
  },
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of store) {
      if (v.kind === 'counter') out[k] = v.value;
      else {
        const sorted = [...v.values].sort((a, b) => a - b);
        const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
        out[k] = { count: sorted.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) };
      }
    }
    return out;
  },
  reset(): void {
    store.clear();
  },
};
