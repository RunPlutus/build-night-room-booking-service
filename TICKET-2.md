**Priority:** High · **Reporter:** Facilities

We installed a movable divider in Summit (6th floor, 30 seats). From Monday it can be booked three ways:

- **Summit**: the whole room (unchanged, same id `rm-summit`)
- **Summit A**: the window half, 14 seats
- **Summit B**: the door half, 14 seats

Rules:

- If the whole room is booked, neither half is available.
- If either half is booked, the whole room isn't available.
- The two halves can be booked at the same time by different people.
- Everything else works as usual (back-to-back, recurring meetings, cancellations, the calendar).

The official release adds these two records to the `rooms` array in `data/rooms.json`. Keep one copy of each record and preserve their values. If you think they are wrong, tell us in your demo.

```json
{
  "id": "rm-summit-a",
  "name": "Summit A",
  "floor": 6,
  "capacity": 14,
  "features": [
    "display"
  ],
  "status": "active",
  "parentId": "rm-summit",
  "createdAt": "2026-10-19T00:00:00.000Z"
},
{
  "id": "rm-summit-b",
  "name": "Summit B",
  "floor": 6,
  "capacity": 14,
  "features": [
    "display",
    "vc"
  ],
  "status": "active",
  "parentId": "rm-summit",
  "createdAt": "2026-10-19T00:00:00.000Z"
}
```
