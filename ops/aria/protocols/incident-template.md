# Incident — <one-line title>

> Copy to `ops/aria/log/YYYY-MM-DD-incident-<slug>.md` when an incident starts.
> An incident = users can't reach her, she's unsafe, data is at risk, or spend
> is running away. When in doubt, it's an incident.

- **Opened:** YYYY-MM-DD HH:MM (tz) · **Status:** OPEN | MITIGATED | RESOLVED
- **Severity:** SEV1 (down/unsafe/data) · SEV2 (degraded) · SEV3 (annoyance)
- **Detected by:** alert | user report | weekly review · **reqIds:** …

## Impact
Who/what was affected, for how long. (Users, turns failed, data exposure yes/no.)

## Timeline (UTC)
- HH:MM — first signal …
- HH:MM — mitigation …
- HH:MM — resolved …

## Mitigation
What stopped the bleeding (rollback per `docs/release/RELEASE.md` §6, flag off, key rotation…).

## Root cause
The actual mechanism — not "human error."

## Privacy check (MANDATORY for an intimate product)
- [ ] No conversation content exposed in logs/artifacts during response
- [ ] If user data was touched: scope named, affected users counted, disclosure decision recorded

## Follow-ups (each → a GitHub issue)
- [ ] …

## Writeback
Link this note in `ops/aria/log/index.md` + the related issue; add a regression
test if the cause was code.
