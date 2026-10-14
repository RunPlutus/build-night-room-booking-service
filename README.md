# Double Booked: the room-booking challenge

You are the engineer on call for an office's meeting-room booking service. Teams use it to book rooms, schedule recurring meetings, cancel plans, and check availability on calendars and room kiosks.

People have started turning up to rooms that are already occupied. Others cannot book rooms that should be free. Engineering says CI is green, but Facilities has a list of incidents and wants the service working reliably again.

**Your task: investigate the complaints, fix the service, add regression tests, and explain your changes in a short demo.** Work in the existing TypeScript service. You can work solo or in a pair and use AI coding tools within the participation rules.

## The complaints

Facilities reported these incidents. The full ticket and acceptance requirements are in [TICKET.md](TICKET.md).

| When | Room | What people experienced |
| --- | --- | --- |
| Mon 5 Oct, 10:00 | Everest | Sales arrived for their confirmed meeting, but the Monday all-hands was already there with a confirmation too. |
| Tue 6 Oct, 09:30 | Fuji | A weekly standup running since July collided with a confirmed offsite planning session. |
| Wed 7 Oct | Fuji | A 15:00-16:00 booking was rejected even though the previous meeting ended at 15:00. |
| Thu 8 Oct, 13:00 | Rainier | A customer call and an interview loop both received confirmations for 13:00-14:00. |
| Fri 9 Oct | Kilimanjaro | A meeting cancelled the previous evening still appeared on the calendar and kept others from using the room. |

Use the calendar and complaint replay to see the failures yourself. The supplied tests pass at the start; they do not cover everything Facilities is reporting. Your changes should fix the underlying behavior and preserve the parts of the service that already work.

## How the night works

The challenge lasts **85 minutes**, including demos.

| Time | What happens |
| --- | --- |
| 0-8 minutes | Read this brief, the ticket and the participation rules. Get your branch and app ready. |
| 8-45 minutes | Investigate, implement fixes and add regression tests. |
| At minute 45 | Facilities sends a follow-up ticket. The facilitator provides a Git release to merge into your branch. |
| 45-70 minutes | Handle the follow-up while keeping your earlier fixes working. |
| At minute 70 | Stop editing, push your submission and send the facilitator your branch name and full commit SHA. |
| 70-85 minutes | Demo your work: 90 seconds for a solo entry or 3 minutes for a pair. |

You can ask the facilitator for Facilities policy facts or help with setup. The investigation and implementation belong to your team. The follow-up ticket will be announced to everyone at the same time.

## AI use and ground rules

Read [AGENTS.md](AGENTS.md) before starting. It defines the participation rules for automated tools. Claude Code loads it through [CLAUDE.md](CLAUDE.md); if another tool does not load it automatically, ask it to read the whole file before working.

Use your agent within those rules and take responsibility for the result. The human builder may inspect and edit the entire candidate codebase manually without asking the facilitator. Be ready to explain what you investigated, what you changed and how you verified it.

- Keep the API shapes and the `createApp(options?)` export in `src/app.ts` stable.
- Preserve the supported shared scheduling interfaces, supplied tests and complaint replays. Add regression coverage for your changes.
- Keep booking history intact. Room identity metadata may be corrected when historical booking references are preserved.
- Follow the booking policy in `config/policies.json` unless a Facilities ticket changes it.
- Work only on your own team's branch. Do not inspect other submissions, push to main, force-push or delete branches.
- Report incomplete work and failed checks honestly. Partial submissions are welcome.

## What you are aiming for

Make the reported operations behave correctly, keep existing behavior working, and demonstrate the fixes with meaningful regression tests. The service must work when requests reach different server instances sharing the same database. Run both the ordinary test suite and the public complaint replay; a green unit-test result alone is not completion.

| Scoring | Points |
| --- | ---: |
| Correct behavior, checked by the facilitator's automated tests | 60 |
| Short demo explaining one complaint, the path you investigated, the change and its regression test | 30 |
| Following the rules, preserving service contracts and history, and reporting results clearly | 10 |

For your demo, choose one complaint and show the behavior after your change. Explain the cause, the relevant request path, the assumption you corrected, and how the test catches the problem. Include the work you did yourself. Use `HANDOFF.txt` for the required written status; its format is defined in AGENTS.md.

## Get started

You need Git, Node 20 or later, and write access to this repository. Confirm access before the event so you can push your submission. Replace `your-team` with a unique name for your solo entry or pair:

```sh
git clone https://github.com/RunPlutus/build-night-room-booking-service.git
cd build-night-room-booking-service
git switch -c candidate/your-team
npm ci
npm run typecheck
npm test
npm run replay
```

If you use nvm, run `nvm use` after entering the repository to select the version in `.nvmrc`.

The starter has **66 passing tests** and a passing type check. The complaint replay is expected to fail at first: **8 of 24 checks pass**. It starts and stops its own temporary server, so you do not need to launch one before running it.

### Explore the calendar

```sh
npm run demo
```

Open [localhost:4000](http://localhost:4000). The demo runs two app instances sharing one database. Use the Server A/B selector to choose the instance, click an empty slot to book, and click a booking to cancel. **Replay a complaint** runs Facilities' incidents against fresh seed data and shows expected and actual results.

Restart the demo after source changes. **Reset data** reloads the seed data. Stop the server with Ctrl-C when finished. To run the API separately without the calendar, use `npm run dev` in another terminal; it listens at [localhost:8080](http://localhost:8080).

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript without emitting a build. |
| `npm test` | Run the supplied tests and your added tests. |
| `npm run replay` | Run the public complaint acceptance checks. |
| `npm run validate:data` | Check the data files and report validation findings. |
| `npm run demo` | Open the interactive calendar service. |
| `npm run dev` | Run the API with source watching. |

## Submit your branch

At minute 70, run the checks again and save `HANDOFF.txt` using the format in AGENTS.md. Review your changes before staging them. Keep node_modules, credentials and unrelated files out of the submission.

```sh
npm run typecheck
npm test
npm run replay
git status --short
git add .
git commit -m "Submit booking challenge"
git push -u origin HEAD
git branch --show-current
git rev-parse HEAD
```

Send the facilitator the branch name and full commit SHA printed by the last two commands. The host grades that exact committed version, including your regression tests. Uncommitted work is not submitted. No pull request or ZIP is needed. If some checks still fail, submit your progress and record the real results.

## Service reference

The following sections describe the service's API, booking policy, architecture and file layout for your investigation.

### API

| Endpoint | Description |
| --- | --- |
| `GET /api/rooms[?includeRetired=true]` | Rooms |
| `GET /api/rooms/:id` | One room |
| `GET /api/rooms/:id/availability?date=YYYY-MM-DD` | Busy periods for that day |
| `POST /api/bookings` | Create a booking (one-off or recurring) |
| `GET /api/bookings/:id` | One booking |
| `DELETE /api/bookings/:id` | Cancel (soft delete, idempotent) |
| `GET /api/bookings?roomId=&from=YYYY-MM-DD&to=YYYY-MM-DD` | Occurrences in a range |

#### Booking rules

1. **Times** are office-local wall clock, `YYYY-MM-DDTHH:MM`. One office, no timezones.
2. **Intervals are half-open**: a booking occupies `[start, end)`. A meeting ending at 15:00 does not overlap one starting at 15:00. Back-to-back is allowed; there are no buffers between meetings (FAC-12).
3. Start and end must be on 15-minute boundaries. Max length 10 hours.
4. **Recurring** bookings: `recurrence: { freq: "DAILY" | "WEEKLY", interval?, until? | count? }`. A series may span at most 366 days. Every occurrence of a series is checked for conflicts.
5. A booking that overlaps any confirmed booking in the same physical room gets `409 CONFLICT` with the clashing bookings in `error.details`.
6. **Cancelled** bookings don't block anything and don't show in availability.
7. **Renamed rooms**: the old record is kept with `status: "retired"` and `replacedBy` pointing at the new room, so old bookings still count (ADR-0004). Retired rooms can't be booked directly.
8. Production runs several replicas against one database. Correctness must not depend on which replica handles a request.

### How it works

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

### Repo layout

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
