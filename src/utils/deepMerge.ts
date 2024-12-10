type Obj = Record<string, any>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursively merges `patch` into `base`. Arrays are replaced, not concatenated. */
export function deepMerge<T>(base: T, patch: Partial<T> | Obj): T {
  const out: Obj = { ...(base as Obj) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out as T;
}
