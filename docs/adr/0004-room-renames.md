# ADR-0004: Room renames keep the old record
Status: Accepted (2025-08)

When a room is renamed or replaced, keep the old record, set `status:
"retired"` and `replacedBy: <new id>`. Bookings made against the old id remain
valid and count as bookings in the new room. Don't rewrite historical
bookings: audit and calendar-sync IDs depend on them.

First used for Atlas -> Olympus (FAC-61).
