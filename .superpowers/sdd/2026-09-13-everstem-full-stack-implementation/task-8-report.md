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
