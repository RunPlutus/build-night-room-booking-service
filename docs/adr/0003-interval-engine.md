# ADR-0003: Interval-based engine replaces the slot grid
Status: Accepted (2024-12)

v1 modelled each room-day as 48 half-hour slots. It couldn't do 15-minute
meetings and treated the slot *containing* the end time as taken.

v2 stores bookings as half-open intervals `[start, end)` and checks overlap
arithmetically. Back-to-back meetings are allowed (confirmed with Facilities,
FAC-12: no cleaning buffers between meetings).

Conflicts are checked in the database transaction that inserts the booking,
so concurrent requests on different replicas can't both win.
