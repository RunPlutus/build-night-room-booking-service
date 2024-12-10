import fs from 'node:fs';
import path from 'node:path';
import { deepMerge } from '../utils/deepMerge';

export interface AppConfig {
  port: number;
  availabilityCacheTtlSeconds: number;
  features: { calendarSync: boolean; emailReminders: boolean; admin: boolean; v1Routes: boolean; userHeaderWarning: boolean };
  auth: { enabled: boolean; headerName: string };
}

const DEFAULTS: AppConfig = {
  port: 8080,
  availabilityCacheTtlSeconds: 600,
  features: { calendarSync: false, emailReminders: false, admin: false, v1Routes: false, userHeaderWarning: true },
  auth: { enabled: false, headerName: 'x-api-key' },
};

function strip(o: any): any {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, strip(v)]));
  return o;
}

export function loadConfig(env = process.env): AppConfig {
  const dir = path.resolve(__dirname, '../../config');
  let cfg = structuredClone(DEFAULTS);
  for (const f of ['default.json', `${env.NODE_ENV ?? 'development'}.json`]) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) cfg = deepMerge(cfg, strip(JSON.parse(fs.readFileSync(p, 'utf8'))));
  }
  if (env.PORT) cfg.port = Number(env.PORT);
  return cfg;
}
