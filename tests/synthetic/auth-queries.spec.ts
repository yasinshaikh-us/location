// Layer 2 of the synthetic-monitoring framework: authenticated black-box
// checks — natural-language location queries against real GPS-ping data,
// plus date-range/timezone regression tests targeting lib/format.ts's
// formatDateTime (the one date function in this app that round-trips
// through toLocaleString + a browser-dependent re-parse instead of the
// Intl.DateTimeFormat.formatToParts pattern used everywhere else) across
// DST boundaries and across Chromium/WebKit.
//
// Needs a way to act as a signed-in user against the real deployment
// (a dedicated monitoring Google/Supabase account's session, refreshed and
// injected the way tests/e2e/timeline.spec.ts's follow-up work describes —
// via Playwright storageState or an admin-created session — but pointed at
// production instead of a local mock) plus known GPS-ping fixture data to
// assert against. Procedure for provisioning and refreshing that session is
// still being worked out — no tests here yet.
