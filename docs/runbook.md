# Runbook

## "Room shows busy but the meeting was cancelled"
Availability is cached per room/day for 10 minutes. `POST /admin/cache/flush`
clears it. If it persists after a flush, check the booking's status.

## "Double booking"
1. `GET /api/bookings?roomId=…&from=…&to=…` for the room.
2. Check whether the two bookings are in rooms that are the same physical room
   (renames: see ADR-0004).
3. Check createdAt; near-identical timestamps suggest concurrent requests.

## Log noise
- `X-User-Email header missing` is expected for kiosk and sync callers.
- `reminder loop: SMTP not configured` is expected outside prod.
