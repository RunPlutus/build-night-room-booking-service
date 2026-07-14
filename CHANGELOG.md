# Changelog

## 1.5.0
- Rename 4B -> Everest for new wayfinding signs (FAC-88)
- Moved CI to GitHub Actions; `validate:data` step dropped for now

## 1.4.0
- Availability cache per room/day, 10 min TTL, invalidated on new bookings (PERF-19). Calendar p95 380ms -> 22ms

## 1.3.0
- Recurrence expansion capped per series (PERF-12). Conflict-check p95 210ms -> 35ms

## 1.2.0
- Atlas -> Olympus rename, using replacedBy (FAC-61)
- Google calendar sync (read-only mirror, behind feature flag)

## 1.1.0
- Recurring bookings (DAILY / WEEKLY)
- iCal export

## 1.0.0
- v2 interval-based booking engine (ADR-0003). v1 slot API returns 410.
