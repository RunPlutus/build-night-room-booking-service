# room-booking-service

Meeting-room booking for the office: rooms, one-off and recurring bookings, cancellations, and per-day availability for the calendar UI and the room kiosks.

```
POST /api/bookings
{ "roomId": "rm-fuji", "title": "Design sync", "organizer": "sam@example.com",
  "start": "2026-11-03T14:00", "end": "2026-11-03T15:00" }

201 Created
{ "id": "bk_3f9a1c2e", "roomId": "rm-fuji", ..., "status": "confirmed" }
```

## Quick start

```bash
nvm use          # Node 20+
npm install
npm test         # ~65 tests, all green
npm run dev      # http://localhost:8080
npm run demo     # calendar UI on http://localhost:4000 (two replicas, one database)
```

### Demo calendar

`npm run demo` serves a day-view calendar backed by **two app instances sharing one database**, the way production runs. Pick which server the calendar talks to, click an empty slot to book, click a booking to cancel. The **Replay a complaint** panel re-runs Facilities' reported incidents against a fresh copy of the seed data and shows what happened. Code changes need a restart of `npm run demo`; data changes are picked up by **Reset data**.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/rooms[?includeRetired=true]` | Rooms |
| `GET /api/rooms/:id` | One room |
| `GET /api/rooms/:id/availability?date=YYYY-MM-DD` | Busy periods for that day |
| `POST /api/bookings` | Create a booking (one-off or recurring) |
| `GET /api/bookings/:id` | One booking |
| `DELETE /api/bookings/:id` | Cancel (soft delete, idempotent) |
| `GET /api/bookings?roomId=&from=YYYY-MM-DD&to=YYYY-MM-DD` | Occurrences in a range |

### Booking rules

1. **Times** are office-local wall clock, `YYYY-MM-DDTHH:MM`. One office, no timezones.
2. **Intervals are half-open**: a booking occupies `[start, end)`. A meeting ending at 15:00 does not overlap one starting at 15:00. Back-to-back is allowed; there are no buffers between meetings (FAC-12).
3. Start and end must be on 15-minute boundaries. Max length 10 hours.
4. **Recurring** bookings: `recurrence: { freq: "DAILY" | "WEEKLY", interval?, until? | count? }`. A series may span at most 366 days. Every occurrence of a series is checked for conflicts.
5. A booking that overlaps any confirmed booking in the same physical room gets `409 CONFLICT` with the clashing bookings in `error.details`.
6. **Cancelled** bookings don't block anything and don't show in availability.
7. **Renamed rooms**: the old record is kept with `status: "retired"` and `replacedBy` pointing at the new room, so old bookings still count (ADR-0004). Retired rooms can't be booked directly.
8. Production runs several replicas against one database. Correctness must not depend on which replica handles a request.

## How it works

```
routes -> controllers
  BookingsController -> validateBookingInput -> BookingService
       BookingService -> ConflictService -> RoomRepository / BookingRepository -> Database
  RoomsController    -> AvailabilityService (+ AvailabilityCache)
```

- `src/db/Database.ts` is the embedded store used in dev and tests (Cloud SQL in prod). Async, with realistic latency, and `transaction()` for serializable work.
- `src/scheduling/*` holds time parsing, overlap and recurrence expansion.
- Rooms and seed bookings live in `data/rooms.json` and `data/bookings.json`.
- The 4B -> Everest rename (FAC-88) is complete; its bookings were migrated in FAC-91.

## Repo layout

| Path | What |
| --- | --- |
| `src/services`, `src/repositories`, `src/scheduling` | Core booking logic |
| `src/legacy/v1` | Retired slot-grid scheduler (reference only) |
| `src/clients/generated` | Generated API client (do not edit) |
| `src/integrations` | Google / Outlook calendar sync (off) |
| `src/notifications`, `src/export`, `src/analytics`, `src/admin` | Reminders, iCal, analytics, admin console |
| `scripts/` | Data validation, migrations, exports |
| `public/`, `scripts/demo-server.ts` | Demo calendar (`npm run demo`) |
| `docs/adr` | Architecture decisions |

## Ground rules

- Keep `createApp(options?)` exported from `src/app.ts`. Tests pass a shared `db` to several `createApp()` calls to simulate replicas.
- Keep the API shapes stable.
- Booking policy (`config/policies.json`) is owned by Facilities. Don't change it without a FAC ticket.
