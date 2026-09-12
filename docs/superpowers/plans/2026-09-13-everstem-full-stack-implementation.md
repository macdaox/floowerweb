# EVERSTEM Full-Stack Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the approved EVERSTEM HTML demo into a tested Astro full-stack B2B website and CMS deployable from GitHub to Cloudflare Pages with D1 and R2.

**Architecture:** One Astro SSR application serves public pages, React-powered admin islands, and server API routes on Cloudflare Pages Functions. Focused domain services own validation and D1 access; R2 owns image bytes while D1 owns media metadata. Every vertical task ends in runnable, reviewable software.

**Tech Stack:** TypeScript, Astro, React, Cloudflare adapter/Pages Functions, D1 SQLite, R2, Drizzle ORM, Zod, Vitest, Testing Library, Playwright, npm, Wrangler

**Spec:** `docs/superpowers/specs/2026-09-13-everstem-full-stack-design.md`

## Global Constraints

- Preserve the existing ivory/stone/brown/olive visual identity, editorial typography, asymmetric grids, fine rules, responsive layouts, and reduced-motion behavior.
- The public site is English-only in release one; persisted content carries `locale` and optional `translation_group_id` for future Chinese content.
- Products have no public pricing, cart, checkout, or payments.
- Inquiries and subscriptions are stored in D1 and shown in admin; the release sends no automatic email.
- Public pages are unrestricted; `/admin` uses application username/password sessions and does not use Cloudflare Access.
- Deploy to Cloudflare Pages with separate preview and production D1/R2 bindings.
- Never commit administrator credentials, session secrets, `.dev.vars`, or production secrets.
- Prefer soft deletion/archival; never physically remove an R2 object while referenced.

## File Structure

```text
astro.config.mjs                 Astro SSR and Cloudflare adapter configuration
wrangler.toml                    Pages runtime, D1, R2, and environment bindings
package.json                     Scripts and pinned dependency ranges
src/env.d.ts                     Typed Cloudflare runtime environment
src/middleware.ts                Request context, session loading, admin route guard
src/layouts/                     Public and admin page shells
src/pages/                       Public pages, admin pages, API route handlers, errors
src/components/public/           Public navigation, cards, galleries, and forms
src/components/admin/            React admin shell, lists, editors, upload UI
src/features/auth/               Passwords, sessions, role authorization
src/features/catalog/            Categories/products schemas, repositories, services
src/features/content/            Pages/spaces/articles schemas, repositories, services
src/features/inquiries/          Inquiry/subscriber validation and services
src/features/media/              R2 object and media-reference operations
src/features/settings/           Site settings operations
src/lib/db/                      Drizzle client, schema exports, shared DB types
src/lib/http/                    JSON envelopes, errors, origin/CSRF/rate-limit helpers
src/styles/                      Existing design tokens plus global/public/admin CSS
public/assets/                   Existing demo image assets
migrations/                      Versioned D1 SQL migrations
scripts/                         Seed and administrator initialization commands
tests/unit/                      Pure function and component tests
tests/integration/               D1/API/service integration tests
tests/e2e/                       Playwright public/admin journeys
```

---

### Task 1: Astro/Cloudflare Foundation and Demo Preservation

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.toml`, `.gitignore`, `src/env.d.ts`, `src/pages/health.ts`, `tests/unit/health.test.ts`, `vitest.config.ts`
- Move: `assets/*` to `public/assets/*`, `tokens.css` to `src/styles/tokens.css`, `styles.css` to `src/styles/legacy-reference.css`
- Preserve: `index.html`, `site.js` as temporary visual references until Task 5

**Interfaces:**
- Produces: `RuntimeEnv { DB: D1Database; MEDIA: R2Bucket; SESSION_SECRET: string }`
- Produces: `GET /health -> { ok: true, service: "everstem" }`

- [ ] **Step 1: Write the failing health handler test**

```ts
import { describe, expect, it } from "vitest";
import { GET } from "../../src/pages/health";

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const response = await GET({} as never);
    expect(await response.json()).toEqual({ ok: true, service: "everstem" });
  });
});
```

- [ ] **Step 2: Scaffold dependencies/configuration and verify the red test**

Run: `npm install && npm test -- --run tests/unit/health.test.ts`
Expected: FAIL because `src/pages/health.ts` does not exist.

- [ ] **Step 3: Implement the typed health endpoint and Cloudflare configuration**

```ts
export function GET(): Response {
  return Response.json({ ok: true, service: "everstem" });
}
```

Configure `output: "server"` with `@astrojs/cloudflare`, declare `DB`, `MEDIA`, and `SESSION_SECRET`, bind preview resource names in `wrangler.toml`, and add scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `db:migrate:local`, and `typecheck`.

- [ ] **Step 4: Verify foundation**

Run: `npm test -- --run tests/unit/health.test.ts && npm run typecheck && npm run build`
Expected: all commands exit 0 and the build emits the health route.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json wrangler.toml .gitignore src public tests vitest.config.ts index.html site.js
git commit -m "build: establish Astro Cloudflare foundation"
```

### Task 2: D1 Schema, Migrations, and Seed Content

**Files:**
- Create: `drizzle.config.ts`, `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/types.ts`, `migrations/0001_initial.sql`, `scripts/seed.ts`, `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `RuntimeEnv.DB`
- Produces: `createDb(binding: D1Database): AppDb`
- Produces tables and enums exactly matching Spec sections 6 and 11.

- [ ] **Step 1: Write a failing schema contract test**

```ts
it("creates every required table and inquiry status constraint", async () => {
  await applyMigration(db, "migrations/0001_initial.sql");
  const names = await tableNames(db);
  expect(names).toEqual(expect.arrayContaining([
    "users", "sessions", "categories", "products", "product_images",
    "spaces", "space_images", "articles", "pages", "media", "inquiries",
    "inquiry_notes", "subscribers", "settings", "audit_logs"
  ]));
  await expect(insertInquiry(db, { status: "invalid" })).rejects.toThrow();
});
```

- [ ] **Step 2: Run the isolated D1 test**

Run: `npm test -- --run tests/integration/schema.test.ts`
Expected: FAIL because migration helpers/schema are absent.

- [ ] **Step 3: Implement normalized schema and migration**

Use text UUIDs, ISO timestamps, foreign keys, unique `(locale, slug)` indexes, product-code uniqueness, status `CHECK` constraints, indexes for publish/status/date filters, nullable `translation_group_id`, and JSON text only for bounded modular blocks/specifications. Include demo-derived English categories, products, pages, spaces, and articles in an idempotent seed script.

- [ ] **Step 4: Apply and verify twice**

Run: `npm run db:migrate:local && npm run db:migrate:local && npm test -- --run tests/integration/schema.test.ts`
Expected: both migration commands are safe; test passes.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts src/lib/db migrations scripts/seed.ts tests/integration/schema.test.ts
git commit -m "feat: add D1 content schema and seed data"
```

### Task 3: HTTP Contracts, Validation, and Abuse Controls

**Files:**
- Create: `src/lib/http/result.ts`, `src/lib/http/errors.ts`, `src/lib/http/origin.ts`, `src/lib/http/rate-limit.ts`, `src/lib/http/request.ts`, `tests/unit/http.test.ts`

**Interfaces:**
- Produces: `ok<T>(data: T, status?: number): Response`
- Produces: `fail(code: string, message: string, status: number, fields?: Record<string,string>): Response`
- Produces: `assertAllowedOrigin(request: Request, siteUrl: string): void`
- Produces: `consumeRateLimit(db: AppDb, key: string, limit: number, windowSeconds: number): Promise<boolean>`

- [ ] **Step 1: Write failing response/origin/rate-limit tests**

```ts
expect(await ok({ id: "1" }).json()).toEqual({ ok: true, data: { id: "1" } });
expect(() => assertAllowedOrigin(requestFrom("https://evil.test"), "https://everstem.test"))
  .toThrowError(HttpError);
expect(await consumeRateLimit(db, "ip:form", 2, 60)).toBe(true);
expect(await consumeRateLimit(db, "ip:form", 2, 60)).toBe(true);
expect(await consumeRateLimit(db, "ip:form", 2, 60)).toBe(false);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/unit/http.test.ts`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement helpers**

Return envelopes `{ ok: true, data }` and `{ ok: false, error: { code, message, fields? } }`; accept same-origin mutations only; store fixed-window counters in a D1 `rate_limits` table added by `migrations/0002_rate_limits.sql`; parse JSON/form bodies with explicit byte limits.

- [ ] **Step 4: Verify**

Run: `npm run db:migrate:local && npm test -- --run tests/unit/http.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http migrations/0002_rate_limits.sql tests/unit/http.test.ts
git commit -m "feat: define secure HTTP contracts"
```

### Task 4: Password Authentication, Sessions, and Role Guards

**Files:**
- Create: `src/features/auth/password.ts`, `session.ts`, `authorize.ts`, `schemas.ts`, `service.ts`, `src/pages/api/auth/login.ts`, `logout.ts`, `me.ts`, `src/middleware.ts`, `scripts/create-admin.ts`, `tests/unit/auth.test.ts`, `tests/integration/auth-api.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>` using PBKDF2-SHA-256, random 16-byte salt, 600,000 iterations, 32-byte output
- Produces: `verifyPassword(password: string, encoded: string): Promise<boolean>`
- Produces: `createSession(db, userId, metadata): Promise<{ token: string; expiresAt: string }>`; D1 stores only SHA-256 token digest
- Produces: `requireRole(locals, allowed: Role[]): AuthUser`

- [ ] **Step 1: Write failing password/session/role tests**

```ts
const encoded = await hashPassword("correct horse battery staple");
expect(await verifyPassword("correct horse battery staple", encoded)).toBe(true);
expect(await verifyPassword("wrong", encoded)).toBe(false);
expect(encoded).not.toContain("correct horse");
expect(() => requireRole(editorLocals, ["admin"])).toThrowErrorMatchingObject({ status: 403 });
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/unit/auth.test.ts tests/integration/auth-api.test.ts`
Expected: FAIL because auth modules/routes do not exist.

- [ ] **Step 3: Implement authentication**

Use constant-time byte comparison; a 32-byte random opaque session token; a seven-day expiry; cookie name `everstem_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`; generic invalid-credentials errors; D1-backed login limits; origin checking on mutations; session renewal only near expiry; and audit records for login, logout, password, user, and role operations.

- [ ] **Step 4: Implement administrator initialization**

`npm run admin:create -- --email admin@example.com` reads the password from `EVERSTEM_ADMIN_PASSWORD`, refuses weak passwords and duplicate users, hashes it, inserts an active `admin`, and never prints the password.

- [ ] **Step 5: Verify**

Run: `npm test -- --run tests/unit/auth.test.ts tests/integration/auth-api.test.ts && npm run typecheck`
Expected: PASS; login sets the secure cookie and DB contains only its digest.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth src/pages/api/auth src/middleware.ts scripts/create-admin.ts tests
git commit -m "feat: add D1-backed admin authentication"
```

### Task 5: Public Shell, Design System, and Home Page

**Files:**
- Create: `src/layouts/PublicLayout.astro`, `src/components/public/Header.astro`, `Footer.astro`, `MobileMenu.tsx`, `Reveal.astro`, `src/pages/index.astro`, `src/styles/global.css`, `src/styles/public.css`, `tests/e2e/home.spec.ts`
- Modify: `src/styles/tokens.css`
- Delete after parity: `index.html`, `site.js`, `src/styles/legacy-reference.css`

**Interfaces:**
- Consumes: seeded `pages`, `categories`, `products`, `spaces`, `articles`, `settings`
- Produces: `PublicLayout` props `{ title, description, canonical?, socialImage?, theme? }`

- [ ] **Step 1: Write the failing home journey**

```ts
test("home preserves the brand demo and navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /nature, reimagined/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "About Us" })).toHaveAttribute("href", "/about");
  await expect(page.getByRole("link", { name: "Contact Us" })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("link", { name: /request catalog/i }).first()).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/home.spec.ts`
Expected: FAIL because Astro home/layout is absent.

- [ ] **Step 3: Port the demo into reusable components**

Render the existing hero, statement, collections, spaces, detail, journal, craft, trade, and footer from seeded content. Preserve all original images, responsive rules, skip link, semantic headings, keyboard menu, focus styles, intersection reveal, and reduced-motion fallback. Use client JavaScript only for menu/reveal behavior.

- [ ] **Step 4: Verify visual shell**

Run: `npm run test:e2e -- tests/e2e/home.spec.ts && npm run build`
Expected: PASS; manually compare 390px, 768px, and 1440px screenshots to the demo before deleting legacy references.

- [ ] **Step 5: Commit**

```bash
git add src public tests/e2e/home.spec.ts index.html site.js
git commit -m "feat: rebuild EVERSTEM home in Astro"
```

### Task 6: Collections and Product Details

**Files:**
- Create: `src/features/catalog/schemas.ts`, `repository.ts`, `service.ts`, `src/components/public/ProductCard.astro`, `ProductGallery.tsx`, `ProductInquiryForm.tsx`, `src/pages/collections/index.astro`, `src/pages/collections/[category].astro`, `src/pages/products/[slug].astro`, `tests/unit/catalog.test.ts`, `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `listPublishedProducts(db, { locale, categorySlug?, page, pageSize }): Promise<Page<ProductCard>>`
- Produces: `getPublishedProductBySlug(db, locale, slug): Promise<ProductDetail | null>`
- Produces: `ProductDetail` with `images`, `specifications`, and `relatedProducts`, never a price field

- [ ] **Step 1: Write failing catalog service and browser tests**

```ts
expect((await getPublishedProductBySlug(db, "en", "magnolia-stem"))?.images.length).toBeGreaterThan(0);
expect(await getPublishedProductBySlug(db, "en", "draft-product")).toBeNull();
await page.goto("/products/magnolia-stem");
await expect(page.getByText(/price/i)).toHaveCount(0);
await expect(page.getByRole("heading", { name: /magnolia/i })).toBeVisible();
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/unit/catalog.test.ts && npm run test:e2e -- tests/e2e/catalog.spec.ts`
Expected: FAIL with missing catalog modules/routes.

- [ ] **Step 3: Implement catalog services and pages**

Use prepared queries, stable `(locale, slug)` lookups, 24-item pagination, category filters, published-only public reads, accessible galleries, related products from the same category, empty states, and 404 responses for missing/draft records.

- [ ] **Step 4: Verify**

Run: `npm test -- --run tests/unit/catalog.test.ts && npm run test:e2e -- tests/e2e/catalog.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog src/components/public src/pages/collections src/pages/products tests
git commit -m "feat: add product catalog and details"
```

### Task 7: Spaces, Journal, About, Contact, Wholesale, and Legal Pages

**Files:**
- Create: `src/features/content/schemas.ts`, `repository.ts`, `service.ts`, `src/components/public/ArticleCard.astro`, `SpaceCard.astro`, `PageSections.astro`, `src/pages/spaces/index.astro`, `src/pages/spaces/[slug].astro`, `src/pages/journal/index.astro`, `src/pages/journal/[slug].astro`, `src/pages/about.astro`, `contact.astro`, `wholesale.astro`, `privacy.astro`, `terms.astro`, `tests/e2e/content.spec.ts`

**Interfaces:**
- Produces: `getPublishedPage(db, key, locale): Promise<ContentPage | null>`
- Produces: `list/getPublishedSpaces`, `list/getPublishedArticles`
- `PageSections` accepts validated discriminated blocks: `hero`, `richText`, `imageText`, `capabilities`, `cta`, `contactDetails`

- [ ] **Step 1: Write failing route/content tests**

```ts
for (const route of ["/about", "/contact", "/wholesale", "/privacy", "/terms", "/spaces", "/journal"]) {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
}
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/content.spec.ts`
Expected: FAIL on absent routes.

- [ ] **Step 3: Implement validated content rendering**

Reject unknown page-block types at write time; render only published English records publicly; sanitize/limit rich text to the supported editor document format; return branded empty/404 states; show related journal items and case studies where applicable.

- [ ] **Step 4: Verify**

Run: `npm run test:e2e -- tests/e2e/content.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/content src/components/public src/pages tests/e2e/content.spec.ts
git commit -m "feat: add editorial and company pages"
```

### Task 8: Inquiry and Subscription Submission

**Files:**
- Create: `src/features/inquiries/schemas.ts`, `repository.ts`, `service.ts`, `src/pages/api/inquiries.ts`, `src/pages/api/subscribers.ts`, `src/components/public/InquiryForm.tsx`, `NewsletterForm.tsx`, `tests/integration/inquiries-api.test.ts`, `tests/e2e/forms.spec.ts`

**Interfaces:**
- Produces: `createInquiry(db, input, context): Promise<{ id: string; status: "new" }>`
- Produces: `subscribe(db, { email, source }): Promise<{ subscribed: true }>`
- Inquiry types: `product`, `contact`, `catalog`; source route and related product are persisted.

- [ ] **Step 1: Write failing valid/invalid/spam tests**

```ts
expect((await postInquiry(validCatalogRequest)).status).toBe(201);
expect((await postInquiry({ ...validCatalogRequest, email: "bad" })).status).toBe(422);
expect((await postInquiry({ ...validCatalogRequest, website: "bot-filled" })).status).toBe(204);
expect(await sentEmailCount()).toBe(0);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/integration/inquiries-api.test.ts`
Expected: FAIL because routes/services are absent.

- [ ] **Step 3: Implement forms and endpoints**

Apply strict Zod schemas, same-origin checks, body limits, honeypot handling, per-IP limits, idempotency keys, normalized emails, accessible field errors, loading/success states, and no mail-provider dependency. Connect home, product, contact, wholesale, and footer forms.

- [ ] **Step 4: Verify**

Run: `npm test -- --run tests/integration/inquiries-api.test.ts && npm run test:e2e -- tests/e2e/forms.spec.ts`
Expected: PASS; D1 contains submissions and no email call occurs.

- [ ] **Step 5: Commit**

```bash
git add src/features/inquiries src/pages/api src/components/public tests
git commit -m "feat: persist inquiries and subscriptions"
```

### Task 9: Admin Shell and Dashboard

**Files:**
- Create: `src/layouts/AdminLayout.astro`, `src/components/admin/AdminApp.tsx`, `AdminNav.tsx`, `DataTable.tsx`, `StatusBadge.tsx`, `src/pages/admin/login.astro`, `index.astro`, `src/pages/api/admin/dashboard.ts`, `src/styles/admin.css`, `tests/e2e/admin-auth.spec.ts`

**Interfaces:**
- Consumes: auth middleware and `requireRole`
- Produces: `GET /api/admin/dashboard` counts and recent inquiries
- Produces: reusable `DataTable<T>` with pagination, search, filters, loading, empty, and error states

- [ ] **Step 1: Write failing protected-route journey**

```ts
await page.goto("/admin");
await expect(page).toHaveURL(/\/admin\/login/);
await loginAs(page, "admin@example.com", process.env.E2E_ADMIN_PASSWORD!);
await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
await expect(page.getByText("New inquiries")).toBeVisible();
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/admin-auth.spec.ts`
Expected: FAIL because admin pages/components are absent.

- [ ] **Step 3: Implement authenticated admin shell**

Provide desktop sidebar/mobile navigation, skip link, user menu/logout, role-aware navigation, dashboard metrics, recent inquiries, accessible tables, and the same brand palette with denser operational typography. Server middleware redirects HTML requests; protected APIs keep 401/403 JSON semantics.

- [ ] **Step 4: Verify**

Run: `npm run test:e2e -- tests/e2e/admin-auth.spec.ts && npm run typecheck`
Expected: PASS for login, logout, redirect, and dashboard.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/AdminLayout.astro src/components/admin src/pages/admin src/pages/api/admin src/styles/admin.css tests/e2e/admin-auth.spec.ts
git commit -m "feat: add authenticated admin dashboard"
```

### Task 10: Admin Content CRUD and Preview

**Files:**
- Create: `src/components/admin/ContentList.tsx`, `ProductEditor.tsx`, `CategoryEditor.tsx`, `SpaceEditor.tsx`, `ArticleEditor.tsx`, `PageEditor.tsx`, `src/pages/admin/products.astro`, `categories.astro`, `spaces.astro`, `journal.astro`, `pages.astro`, `src/pages/api/admin/products/[id].ts`, `categories/[id].ts`, `spaces/[id].ts`, `articles/[id].ts`, `pages/[id].ts`, `tests/integration/admin-content-api.test.ts`, `tests/e2e/admin-content.spec.ts`

**Interfaces:**
- CRUD endpoints accept versioned validated payloads and return `{ ok: true, data }`
- Updates accept `updatedAt` and return 409 on stale edits.
- Archive is the default delete behavior; publish validates all public-required fields.

- [ ] **Step 1: Write failing permission/lifecycle/conflict tests**

```ts
expect((await adminCreateProduct(editor, validDraft)).status).toBe(201);
expect((await adminPublishProduct(sales, productId)).status).toBe(403);
expect((await adminPublishProduct(editor, incompleteProductId)).status).toBe(422);
expect((await adminUpdateProduct(editor, productId, staleVersion)).status).toBe(409);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/integration/admin-content-api.test.ts`
Expected: FAIL because CRUD endpoints are absent.

- [ ] **Step 3: Implement list/edit lifecycle**

Support search, status/category filters, pagination, ordering, locale fixed to English for release one, slug collision messages, draft preview using a short-lived signed preview token, publish/unpublish/archive, audit entries, and unsaved-change warnings.

- [ ] **Step 4: Verify API and browser flows**

Run: `npm test -- --run tests/integration/admin-content-api.test.ts && npm run test:e2e -- tests/e2e/admin-content.spec.ts`
Expected: PASS for product, category, space, article, and page create/edit/publish/archive flows.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/pages/admin src/pages/api/admin tests
git commit -m "feat: add admin content management"
```

### Task 11: R2 Media Library and Gallery Assignment

**Files:**
- Create: `src/features/media/schemas.ts`, `repository.ts`, `service.ts`, `src/components/admin/MediaLibrary.tsx`, `MediaPicker.tsx`, `GalleryEditor.tsx`, `src/pages/admin/media.astro`, `src/pages/api/admin/media/index.ts`, `src/pages/api/admin/media/[id].ts`, `src/pages/media/[key].ts`, `tests/integration/media.test.ts`, `tests/e2e/media.spec.ts`

**Interfaces:**
- Produces: `uploadMedia(env, file, input): Promise<MediaRecord>`
- Produces: `deleteMedia(env, id): Promise<{ deleted: true }>` or 409 when referenced
- Produces: `GET /media/[key]` with content type, ETag, immutable cache headers for immutable keys

- [ ] **Step 1: Write failing upload/reference/deletion tests**

```ts
expect((await upload(editor, jpegFixture)).status).toBe(201);
expect((await upload(editor, executableFixture)).status).toBe(415);
expect((await deleteReferencedMedia(admin, mediaId)).status).toBe(409);
expect(await r2Has(objectKey)).toBe(true);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/integration/media.test.ts`
Expected: FAIL because media service/routes are absent.

- [ ] **Step 3: Implement safe media workflow**

Accept JPG/PNG/WebP/AVIF only; enforce configured byte limits; inspect magic bytes rather than trusting the filename; create UUID-based immutable keys; put R2 before D1 insert and clean up on index failure; require English alt text when attached to publishable content; prevent referenced deletion; allow gallery reordering and cover selection.

- [ ] **Step 4: Verify**

Run: `npm test -- --run tests/integration/media.test.ts && npm run test:e2e -- tests/e2e/media.spec.ts`
Expected: PASS including upload retry, assignment, ordering, and protected deletion.

- [ ] **Step 5: Commit**

```bash
git add src/features/media src/components/admin src/pages/admin/media.astro src/pages/api/admin/media src/pages/media tests
git commit -m "feat: add R2 media management"
```

### Task 12: Inquiry Pipeline, Subscribers, Users, and Settings

**Files:**
- Create: `src/components/admin/InquiryBoard.tsx`, `InquiryDetail.tsx`, `SubscriberList.tsx`, `UserManager.tsx`, `SettingsEditor.tsx`, `src/pages/admin/inquiries.astro`, `subscribers.astro`, `users.astro`, `settings.astro`, `src/pages/api/admin/inquiries/[id].ts`, `subscribers/index.ts`, `subscribers/export.ts`, `users/[id].ts`, `settings/index.ts`, `tests/integration/admin-operations.test.ts`, `tests/e2e/admin-operations.spec.ts`

**Interfaces:**
- Inquiry transitions: `new -> contacted|spam`, `contacted -> qualified|closed|spam`, `qualified -> closed|contacted`, `closed|spam -> contacted`
- CSV export returns UTF-8 with spreadsheet-formula escaping.
- Only `admin` manages users/settings; `sales` manages inquiries and exports.

- [ ] **Step 1: Write failing role, transition, note, and export tests**

```ts
expect((await assignInquiry(sales, inquiryId, sales.id)).status).toBe(200);
expect((await transitionInquiry(sales, inquiryId, "qualified")).status).toBe(422);
expect((await addNote(sales, inquiryId, "Called buyer")).status).toBe(201);
expect((await updateUser(editor, userId)).status).toBe(403);
expect(csvCell("=IMPORTXML(...)" )).toBe("'=IMPORTXML(...)");
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run tests/integration/admin-operations.test.ts`
Expected: FAIL because operational endpoints are absent.

- [ ] **Step 3: Implement workflows**

Add filters for type/status/assignee/date/market/product, full submission context, assignment, validated transitions, immutable author/timestamp notes, subscriber filtering/export, admin-only user activation/role/reset operations, site/contact/social/SEO settings, optimistic conflict detection, and audit logs.

- [ ] **Step 4: Verify**

Run: `npm test -- --run tests/integration/admin-operations.test.ts && npm run test:e2e -- tests/e2e/admin-operations.spec.ts`
Expected: PASS for admin/editor/sales role matrices and inquiry workflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/pages/admin src/pages/api/admin tests
git commit -m "feat: add sales and site administration"
```

### Task 13: SEO, Error Pages, Accessibility, and Performance

**Files:**
- Create: `src/components/public/SeoHead.astro`, `StructuredData.astro`, `src/pages/404.astro`, `500.astro`, `robots.txt.ts`, `sitemap.xml.ts`, `tests/e2e/quality.spec.ts`
- Modify: all public route files and public image components

**Interfaces:**
- Produces: canonical, title, description, Open Graph, Organization/Product/Article/Breadcrumb JSON-LD
- Produces: sitemap containing only published canonical pages

- [ ] **Step 1: Write failing quality assertions**

```ts
await page.goto("/products/magnolia-stem");
await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
await expect(page.locator('script[type="application/ld+json"]')).toContainText('"@type":"Product"');
await page.emulateMedia({ reducedMotion: "reduce" });
await expect(page.locator("[data-reveal]").first()).toBeVisible();
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/quality.spec.ts`
Expected: FAIL for missing metadata/error/sitemap behavior.

- [ ] **Step 3: Implement and audit**

Add unique metadata, escaped JSON-LD, sitemap/robots, branded errors, explicit image dimensions/aspect ratios, lazy loading below fold, responsive image attributes, logical heading order, form labels/errors, focus management, keyboard galleries/menu, contrast-compliant states, and reduced-motion CSS.

- [ ] **Step 4: Run quality gates**

Run: `npm run test:e2e -- tests/e2e/quality.spec.ts && npm run typecheck && npm run build`
Expected: PASS; no broken internal links or public console errors.

- [ ] **Step 5: Commit**

```bash
git add src tests/e2e/quality.spec.ts
git commit -m "feat: complete SEO and accessibility"
```

### Task 14: Deployment Runbook and Final End-to-End Verification

**Files:**
- Create: `.dev.vars.example`, `README.md`, `docs/deployment.md`, `tests/e2e/smoke.spec.ts`
- Modify: `wrangler.toml`, `package.json`, `.gitignore`

**Interfaces:**
- Documents exact local, preview, and production commands.
- Build contract: GitHub `main` -> production Pages; pull requests -> preview; each environment has distinct `DB` and `MEDIA` bindings.

- [ ] **Step 1: Write the smoke test before final configuration**

```ts
test("critical public and admin routes survive a production build", async ({ request }) => {
  for (const route of ["/", "/collections", "/about", "/contact", "/wholesale", "/admin/login", "/health"]) {
    expect((await request.get(route)).status(), route).toBeLessThan(400);
  }
});
```

- [ ] **Step 2: Verify the production-like test initially exposes missing setup**

Run in terminal 1: `npm run build && npm run preview`

Run in terminal 2: `npm run test:e2e -- tests/e2e/smoke.spec.ts`

Expected: FAIL until preview bindings, seed, and documented setup are complete. Stop terminal 1 after the run.

- [ ] **Step 3: Complete configuration and documentation**

Document: Node/npm requirements; install; `.dev.vars`; D1 and R2 creation; binding IDs; migrations; seed; first admin creation; local development; all test commands; production build; GitHub connection; Pages build command/output; preview/production binding setup; custom domain/media domain; rollback; backup/export; and credential rotation. The example environment file uses clearly marked user-supplied sample values, such as `SESSION_SECRET=replace-with-32-random-bytes`.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm clean-install && npm run db:migrate:local && npm run typecheck && npm test -- --run && npm run build && npm run test:e2e`
Expected: every command exits 0; migrations apply; all unit, integration, and browser tests pass; production build succeeds.

- [ ] **Step 5: Check repository hygiene**

Run: `git status --short && git grep -nE '(SESSION_SECRET|EVERSTEM_ADMIN_PASSWORD)=' -- ':!*.example' || true`
Expected: only intended documentation/verification changes are uncommitted and no secret assignment is found.

- [ ] **Step 6: Commit**

```bash
git add .dev.vars.example .gitignore README.md docs/deployment.md wrangler.toml package.json package-lock.json tests/e2e/smoke.spec.ts
git commit -m "docs: add Cloudflare Pages deployment runbook"
```

## Final Review Checklist

- [ ] Compare every specification section to Tasks 1–14 and record no uncovered requirement.
- [ ] Run the complete Task 14 verification command from a clean dependency installation.
- [ ] Review mobile, tablet, and desktop screenshots against the original demo.
- [ ] Verify admin/editor/sales permissions with separate test accounts.
- [ ] Verify no public response includes password hashes, session digests, internal notes, draft content, or secrets.
- [ ] Verify a referenced R2 image cannot be physically deleted.
- [ ] Verify inquiries appear in admin and trigger no email.
- [ ] Verify README instructions succeed from a fresh clone.
