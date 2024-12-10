/* Minimal structured logger. We used to ship pino; removed in 2.1 to cut cold-start time. */
type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return ORDER[lvl] ?? ORDER.info;
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = { ts: new Date().toISOString(), level, msg, ...(ctx ?? {}) };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
  child(bindings: Record<string, unknown>) {
    return {
      debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, { ...bindings, ...c }),
      info: (m: string, c?: Record<string, unknown>) => emit('info', m, { ...bindings, ...c }),
      warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, { ...bindings, ...c }),
      error: (m: string, c?: Record<string, unknown>) => emit('error', m, { ...bindings, ...c }),
    };
  },
};
export type Logger = typeof logger;
