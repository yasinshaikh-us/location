// Layer 3 of the synthetic-monitoring framework: direct-to-Supabase
// cross-checks. Reads the same rows the app would display (via a
// read-scoped key or the monitoring account's own RLS-bound session) and
// diffs them against what /api/query actually renders (map popups, route
// table arrival/departure times) for the same stops — the strongest signal
// for catching subtle date/timezone transform bugs, since it compares
// against ground truth rather than another derived value.
//
// Needs read access to the live `location_pings` table (credentials + how
// they're supplied to CI are still being worked out) and a decision on
// which pings/date ranges to spot-check each run. No tests here yet.
