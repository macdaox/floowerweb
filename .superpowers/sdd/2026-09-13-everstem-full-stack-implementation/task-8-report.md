# Task 8: Inquiry and Subscription Submission

Implemented public inquiry and newsletter persistence without any mail-provider dependency or outbound mail calls.

## Delivered

- Added strict Zod request schemas for product, contact, catalog, and newsletter submissions, including normalized email addresses, source-route validation, named honeypot handling, and field-level error responses.
- Added D1 repositories/services and API endpoints with same-origin enforcement, bounded JSON bodies, D1-backed per-IP limits, idempotency keys, related-product validation, and duplicate-safe subscriptions.
- Added the forward-only `0004_submission_idempotency.sql` migration and matching Drizzle declarations.
- Connected home, product, contact, wholesale, and footer forms using progressive enhancement. Forms retain native markup and now expose loading, success, and accessible field-error states.
- Added real-Miniflare D1 integration coverage for persistence, validation, honeypots, idempotency, and normalized duplicate subscriptions, plus browser coverage for all public forms and their accessible feedback.

## Verification

- `npm test -- --run` — 15 files, 54 tests passed.
- `npm run typecheck` — 0 errors.
- `npm run build` — passed.
- `npm run test:e2e` — 12 browser tests passed.

During verification, the local preview D1 was migrated through `0004` and reseeded so its pre-existing stale page content matched the repository's validated seed format.

## Fix round 1 — 2026-09-14

Completed the submission hardening follow-up with a forward-only `0005_submission_idempotency_ledger.sql` migration.

- Native `application/x-www-form-urlencoded` and multipart forms now map to the same validated inputs as JSON requests. Successful native inquiry and newsletter posts return a 303 redirect with a `submitted` marker; native validation and operational failures return useful HTML.
- Inquiry creation, normalized/deduplicated interests, and the idempotency ledger record are written in one D1 batch. A forced child-row failure leaves no inquiry parent row.
- The idempotency ledger stores the canonical payload hash and original inquiry id. Exact replay returns `{ id, status: "new" }` even when the persisted inquiry status later changes. A changed type or payload returns deterministic `409 idempotency_conflict` before rate limiting.
- Subscription keys are recorded for both new subscribers and existing-email reactivation paths. Exact subscriber replays are safe and key/payload changes conflict deterministically.
- Browser forms retain a key for a network retry, mint a new key when the payload changes, and clear it after success. All visible server-validated fields have tied error text, alert semantics, and schema-aligned length constraints, including the homepage catalog form.
- Added real Miniflare/D1 route coverage for native forms, origins, body caps, rate limit/replay ordering, honeypots, mutable inquiry replay, product/source persistence, atomicity, subscriber idempotency, and no outbound network call. Browser tests cover full field errors plus retry and rotation behavior.

Observed regression evidence before the fixes:

- `npm test -- --run tests/integration/inquiries-hardening.test.ts` failed the new pre-rate-limit conflict case with `expected 429 to be 409`.
- `npm run test:e2e -- tests/e2e/forms.spec.ts` first showed that the catalog interest error was not attached to its visible control; after that mapping fix, the new alert-semantics assertion failed until field errors were made live alerts.

Final verification:

- `npm run db:migrate:local` — applied `0005_submission_idempotency_ledger.sql` successfully to local D1.
- `npm test -- --run` — 16 files, 65 tests passed.
- `npm run test:e2e` — 14 browser tests passed.
- `npm run typecheck` — 0 errors, 0 warnings (2 existing hints).
- `npm run build` — passed.
