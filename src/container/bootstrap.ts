import { Container } from './Container';
import { TOKENS } from './tokens';
import { loadConfig } from '../config';
import { loadPolicies } from '../config/policies';
import { Database } from '../db/Database';
import { createDatabase } from '../db';
import { RoomRepository } from '../repositories/RoomRepository';
import { BookingRepository } from '../repositories/BookingRepository';
import { AvailabilityCache } from '../cache/AvailabilityCache';
import { ConflictService } from '../services/ConflictService';
import { BookingService } from '../services/BookingService';
import { AvailabilityService } from '../services/AvailabilityService';
import { BookingQueryService } from '../services/BookingQueryService';

export interface AppOptions {
  /** Share one Database between several app instances to simulate replicas. */
  db?: Database;
  now?: () => Date;
}

export function buildContainer(opts: AppOptions = {}): Container {
  const c = new Container();
  c.register(TOKENS.Config, () => loadConfig());
  c.register(TOKENS.Policies, () => loadPolicies());
  c.register(TOKENS.Clock, () => opts.now ?? (() => new Date()));
  c.register(TOKENS.Database, () => opts.db ?? createDatabase());
  c.register(TOKENS.RoomRepository, (c) => new RoomRepository(c.resolve(TOKENS.Database)));
  c.register(TOKENS.BookingRepository, (c) => new BookingRepository(c.resolve(TOKENS.Database)));
  c.register(TOKENS.AvailabilityCache, (c) => new AvailabilityCache(c.resolve(TOKENS.Config).availabilityCacheTtlSeconds * 1000));
  c.register(
    TOKENS.ConflictService,
    (c) => new ConflictService(c.resolve(TOKENS.Database), c.resolve(TOKENS.RoomRepository), c.resolve(TOKENS.BookingRepository)),
  );
  c.register(
    TOKENS.BookingService,
    (c) =>
      new BookingService(
        c.resolve(TOKENS.Database),
        c.resolve(TOKENS.RoomRepository),
        c.resolve(TOKENS.BookingRepository),
        c.resolve(TOKENS.ConflictService),
        c.resolve(TOKENS.AvailabilityCache),
        c.resolve(TOKENS.Clock),
      ),
  );
  c.register(
    TOKENS.AvailabilityService,
    (c) => new AvailabilityService(c.resolve(TOKENS.RoomRepository), c.resolve(TOKENS.BookingRepository), c.resolve(TOKENS.AvailabilityCache)),
  );
  c.register(TOKENS.BookingQueryService, (c) => new BookingQueryService(c.resolve(TOKENS.RoomRepository), c.resolve(TOKENS.BookingRepository)));
  return c;
}
