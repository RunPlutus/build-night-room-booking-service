/**
 * Tiny service locator. We evaluated tsyringe/inversify (ADR-0003) and decided
 * the decorator metadata wasn't worth it for ~10 services.
 */
export type Token<T> = symbol & { __type?: T };

export function token<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>;
}

type Provider<T> = { factory: (c: Container) => T; singleton: boolean; instance?: T };

export class Container {
  private providers = new Map<symbol, Provider<unknown>>();

  register<T>(t: Token<T>, factory: (c: Container) => T, opts: { singleton?: boolean } = {}): this {
    this.providers.set(t, { factory, singleton: opts.singleton ?? true });
    return this;
  }

  resolve<T>(t: Token<T>): T {
    const p = this.providers.get(t) as Provider<T> | undefined;
    if (!p) throw new Error(`No provider registered for ${String(t.description)}`);
    if (p.singleton) {
      if (p.instance === undefined) p.instance = p.factory(this);
      return p.instance;
    }
    return p.factory(this);
  }

  has(t: symbol): boolean {
    return this.providers.has(t);
  }
}
