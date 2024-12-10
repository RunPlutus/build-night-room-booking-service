# ADR-0002: One office, no timezones
Status: Accepted (2024-11)

All times are office-local wall clock (`YYYY-MM-DDTHH:MM`). Internally they are
minutes since the epoch *as if* the office were on UTC; that's a calendar
convenience, not a zone. Multi-office support would add a zone per building.
