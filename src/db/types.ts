import { Recurrence } from '../scheduling/recurrence';

export interface RoomRecord {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  features?: string[];
  status: 'active' | 'retired';
  /** For retired rooms that were renamed/replaced: the room that took over its bookings. */
  replacedBy?: string;
  createdAt: string;
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface BookingRecord {
  id: string;
  roomId: string;
  title: string;
  organizer: string;
  /** office-local YYYY-MM-DDTHH:MM, end exclusive */
  start: string;
  end: string;
  recurrence: Recurrence | null;
  status: BookingStatus;
  createdAt: string;
  cancelledAt?: string;
}

export interface Tables {
  rooms: Map<string, RoomRecord>;
  bookings: Map<string, BookingRecord>;
}

export interface Seed {
  rooms: RoomRecord[];
  bookings: BookingRecord[];
}
