/**
 * Minimal span API compatible with the subset of OpenTelemetry we used.
 * Exporting was disabled after the Cloud Trace bill in Q3; spans are now
 * recorded in-memory and dropped unless TRACE_DEBUG=1.
 */
export interface Span {
  name: string;
  start: number;
  end?: number;
  attributes: Record<string, string | number | boolean>;
  setAttribute(k: string, v: string | number | boolean): void;
  finish(): void;
}

const finished: Span[] = [];
const MAX = 200;

export function startSpan(name: string): Span {
  const span: Span = {
    name,
    start: performance.now(),
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    finish() {
      this.end = performance.now();
      if (process.env.TRACE_DEBUG === '1') {
        finished.push(this);
        if (finished.length > MAX) finished.shift();
      }
    },
  };
  return span;
}

export function withSpan<T>(name: string, fn: (s: Span) => T): T {
  const s = startSpan(name);
  try {
    return fn(s);
  } finally {
    s.finish();
  }
}

export function recentSpans(): Span[] {
  return [...finished];
}
