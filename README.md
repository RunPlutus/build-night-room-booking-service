# room-booking-service

Meeting-room booking for the office: rooms, one-off and recurring bookings, cancellations, and per-day availability for the calendar UI and the room kiosks.

```
POST /api/bookings
{ "roomId": "rm-fuji", "title": "Design sync", "organizer": "sam@example.com",
  "start": "2026-11-03T14:00", "end": "2026-11-03T15:00" }

201 Created
{ "id": "bk_3f9a1c2e", "roomId": "rm-fuji", ..., "status": "confirmed" }
```

## Hack night

Start with `TICKET.md` and `AGENTS.md`. This repository contains the initial Facilities incident ticket. Use `npm run replay` to reproduce it without starting a server yourself. The demo defaults to port 4000. The participation rules in AGENTS.md apply to automated coding tools. If your tool does not load AGENTS.md automatically, ask it to read that file before starting.

Clone this repository and make one branch for your solo entry or pair. Replace `your-team` with a unique name:

```sh
git clone https://github.com/RunPlutus/build-night-room-booking-service.git
cd build-night-room-booking-service
git switch -c candidate/your-team
```

You need write access to this repository to push your branch. Check access before the event starts. Work only on your own branch; keep `main` and other teams' branches untouched. Do not inspect other submissions. The facilitator will announce one follow-up ticket during the event and give you the Git command to receive it.

### Submit at minute 70

Run the checks, save `HANDOFF.txt` using the format in AGENTS.md, and commit your work:

```sh
npm run typecheck
npm test
npm run replay
git status --short
git add <your-changed-files> HANDOFF.txt
git commit -m "Submit booking challenge"
git push -u origin HEAD
git rev-parse HEAD
```

Send the facilitator your branch name and the full commit SHA printed by the last command. The host fetches that branch and grades that exact commit in a separate checkout. Uncommitted work is not submitted. Incomplete work is valid to submit; report failed checks honestly. Do not include node_modules, credentials, or unrelated files. No pull request or ZIP is needed.

## Quick start

```bash
nvm use          # Node 20+
npm ci
npm test         # 66 supplied tests, all green in the starter
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
- `src/scheduling/*` holds time parsing, overlap and recurrence expansion. Its exported `overlaps`, `occurrences`, `stepMinutes`, `seriesLimit`, and `lastOccurrenceStart` functions are a supported shared interface. Calendar clients and the API must agree on their results. `npm run replay` checks the shared functions directly as well as the HTTP API.
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
