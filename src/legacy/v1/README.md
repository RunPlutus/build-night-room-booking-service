# v1 slot scheduler (retired)

The original scheduler modelled each room-day as 48 half-hour slots and
marked slots as taken. It couldn't represent 15-minute meetings, so v2
(ADR-0003) moved to interval arithmetic.

`/api/v1/*` now returns 410. The code is kept because the kiosk firmware
team still uses `SlotGrid` as a reference for their offline mode.
Do not import it from v2 code.
