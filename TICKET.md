**Priority:** High · **Reporter:** Facilities

We've had a bad couple of weeks. Complaints from the front desk log:

| When | Room | What happened |
| --- | --- | --- |
| Mon 5 Oct, 10:00 | Everest | Sales showed up for their sync and the Monday all-hands was already in there. Both had confirmations. |
| Tue 6 Oct, 09:30 | Fuji | The platform team's standup (been running every Tuesday since July) collided with an offsite planning session. Both confirmed. |
| Wed 7 Oct | Fuji | Someone tried to book 15:00-16:00 and got "already booked". The 1:1 before it ended at 15:00. |
| Thu 8 Oct, 13:00 | Rainier | A customer call and an interview loop, both confirmed for 13:00-14:00. Nobody can explain how. |
| Fri 9 Oct | Kilimanjaro | Quarterly planning was cancelled the night before, but the calendar still showed the room busy all afternoon, so nobody used it. |

There's a calendar you can use to look at all this: `npm run demo`, then open http://localhost:4000.

Engineering says CI is green and they can't reproduce most of these on their laptops.

**Ask:** figure out what's going on, fix it, and make sure it can't happen again. For each complaint, we want to know what actually caused it. You'll explain that in your demo.

Please keep the API the same, and keep `createApp()` exported from `src/app.ts`.


Calendar reads begun after a completed create or cancellation must reflect that change on every server. Keep caching useful for repeated unchanged reads; do not add delays or require restarts.

The shared scheduling engine is also a supported interface for calendar clients. Its exported overlap and recurrence functions must agree with the API. Run `npm run replay` for the visible acceptance checks, including direct checks of that interface. The ordinary `npm test` suite is intentionally green at the start.

AI tools are welcome within the participation rules in AGENTS.md. The human builder may inspect and edit the entire candidate codebase manually; no facilitator approval or private hint is needed. Preserve the supplied checks, API, shared engine exports, and Facilities policy. Correcting room identity metadata is allowed when historical bookings remain intact. Do not delete booking history.

Submit HANDOFF.txt using the format in AGENTS.md, then push your own branch and send the facilitator its name and full commit SHA. Explain your investigation and changes in the short demo.
