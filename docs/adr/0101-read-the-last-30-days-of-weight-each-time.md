# 0101. Read the last 30 days of weight each time

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

ADR 0100 reads the store's weights from the last read on, at most 30 days back. A weighing is dated when it was measured, not when it reached the store, and many scales' apps write it to Apple Health or Health Connect only once they are opened, days later. A read that starts from the last one never sees such a weighing, and its day stays empty.

## Decision

- **Each read takes the last 30 days** of the store's weights, not those since the last read. The app keeps no time of the last read.
- `import_weights()` writes only the days that changed, so sending the same days again changes nothing.

## Alternatives considered

- **Starting a day before the last read:** misses a weighing written more than a day late.
- **Anchored queries** (HealthKit's anchor, Health Connect's changes token): they return only what was written since, however late, but keep a token per store and user and need their own handling when it expires; 30 days of one weight a day are at most 30 rows.

## Consequences

- A weighing written to the store late fills its day, as long as it is from the last 30 days.
- Each read sends up to 30 days, which the function checks and mostly leaves as they are.
