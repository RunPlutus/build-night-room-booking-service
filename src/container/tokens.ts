import { token } from './Container';
import type { AppConfig } from '../config';
import type { Policies } from '../config/policies';
import type { Database } from '../db/Database';
import type { RoomRepository } from '../repositories/RoomRepository';
import type { BookingRepository } from '../repositories/BookingRepository';
import type { ConflictService } from '../services/ConflictService';
import type { BookingService } from '../services/BookingService';
import type { AvailabilityService } from '../services/AvailabilityService';
import type { BookingQueryService } from '../services/BookingQueryService';
import type { AvailabilityCache } from '../cache/AvailabilityCache';

export const TOKENS = {
  Config: token<AppConfig>('Config'),
  Policies: token<Policies>('Policies'),
  Clock: token<() => Date>('Clock'),
  Database: token<Database>('Database'),
  RoomRepository: token<RoomRepository>('RoomRepository'),
  BookingRepository: token<BookingRepository>('BookingRepository'),
  AvailabilityCache: token<AvailabilityCache>('AvailabilityCache'),
  ConflictService: token<ConflictService>('ConflictService'),
  BookingService: token<BookingService>('BookingService'),
  AvailabilityService: token<AvailabilityService>('AvailabilityService'),
  BookingQueryService: token<BookingQueryService>('BookingQueryService'),
};
