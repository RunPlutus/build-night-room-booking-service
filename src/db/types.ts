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
  /** Containing space: whole-room bookings overlap this room and vice versa. */
  parentId?: string;
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
  /** Freshness authority for all calendar dates of each canonical room view. */
  bookingRevisions: Map<string, number>;
}

export interface Seed {
  rooms: RoomRecord[];
  bookings: BookingRecord[];
}
