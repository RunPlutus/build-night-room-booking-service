export class AppError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 404, 'NOT_FOUND');
  }
}
export class RoomRetiredError extends AppError {
  constructor(id: string, replacedBy?: string) {
    super(`Room ${id} is retired${replacedBy ? `; book ${replacedBy} instead` : ''}`, 400, 'ROOM_RETIRED');
  }
}
export interface ConflictInfo {
  bookingId: string;
  title: string;
  start: string;
  end: string;
}
export class ConflictError extends AppError {
  constructor(public readonly conflicts: ConflictInfo[]) {
    super('Room is already booked for that time', 409, 'CONFLICT', conflicts);
  }
}
export class UnauthorizedError extends AppError {
  constructor() {
    super('Missing or invalid API key', 401, 'UNAUTHORIZED');
  }
}
export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super('Too many requests', 429, 'RATE_LIMITED');
  }
}
