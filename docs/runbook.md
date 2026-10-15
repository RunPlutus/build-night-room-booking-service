# Runbook

## "Room shows busy but the meeting was cancelled"
Availability is cached per physical room/day for 10 minutes. Each create or
effective cancellation atomically advances that room's database revision.
Every server checks the revision before accepting a cache hit, so calendar
reads started after a completed mutation must reflect it immediately.
For divided rooms, the change advances every overlapping view: booking whole
Summit refreshes Summit and both halves; booking Summit A refreshes A and whole
Summit while leaving the independent Summit B view reusable.

Check the booking's status using `GET /api/bookings/:id`: cancelled records
remain for audit but must not appear in either occupying calendar endpoint.
If a stale calendar persists, inspect the writer's transaction/revision path
and the reader's database connection. A manual `POST /admin/cache/flush`
is a diagnostic; it is not a required cancellation step.

## "Double booking"
1. `GET /api/bookings?roomId=…&from=…&to=…` for the room.
2. Check whether the two bookings are in rooms that are the same physical room
   (renames: see ADR-0004).
3. Check createdAt; near-identical timestamps suggest concurrent requests.
4. Preserve historical confirmations, including pre-existing collisions.
   Ask Facilities to adjudicate them; do not delete or silently cancel history.
5. For divided rooms, inspect parentId as well as replacedBy. Parent/child spaces
   overlap; sibling halves do not. Do not collapse the whole family to one room.

## Storage deployment boundary
The repository supplies an embedded store. Production requires a real shared
SQL adapter with atomic conflict-check/insertion, rollback, and durable
canonical-room revisions. All writers must use that protocol; mixed old/new
writers are unsafe. Freshness-critical reads must not use a lagging read replica.
Run the replica regressions against separate real database connections before
claiming a multi-process production deployment is verified.

## Log noise
- `X-User-Email header missing` is expected for kiosk and sync callers.
- `reminder loop: SMTP not configured` is expected outside prod.
