import { loadConfig } from '../config';

const overrides = new Map<string, boolean>();
type Flag = keyof ReturnType<typeof loadConfig>['features'];

export function isEnabled(flag: Flag): boolean {
  return overrides.get(flag) ?? loadConfig().features[flag];
}
export function setOverride(flag: Flag, v: boolean) {
  overrides.set(flag, v);
}
export function clearOverrides() {
  overrides.clear();
}
