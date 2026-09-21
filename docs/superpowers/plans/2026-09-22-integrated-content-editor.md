# Integrated Content Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Chinese-admin users one editor for structured fields, visual rich text, direct R2 image upload, cover selection, and gallery management across products, spaces, articles, and managed pages.

**Architecture:** A shared TipTap adapter owns browser editing while a server-owned rich-text module normalizes and sanitizes submitted HTML and extracts media references. Existing media APIs remain the single upload path; reusable upload and picker controls feed both inline images and galleries. Existing text columns remain in place, so legacy plain text is upgraded on read without destructive data migration.

**Tech Stack:** Astro 5, TypeScript 5.8, TipTap 3.31.3, `sanitize-html` 2.17.7, D1, R2, Vitest, Miniflare, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-integrated-content-editor-design.md`

## Global Constraints

- Public site remains English; administration UI remains Chinese.
- Editor code loads only under `/admin`; public pages must not ship TipTap.
- Existing D1 body columns and `pages.sections_json` remain backward compatible; no destructive migration.
- Images remain private in R2 and are served through `/media/*`.
- Only JPG, PNG, WebP, and AVIF uploads are accepted under `MEDIA_MAX_BYTES`.
- Rich text rejects scripts, event attributes, unsafe URLs, arbitrary inline styles, iframe, font, size, and color controls.
- Publishing requires meaningful English alternative text for referenced R2 images.
- Removing an image from content removes its reference only; R2 deletion remains a separate protected media-library operation.

## Review Focus

- Pasted hostile HTML must become safe normalized HTML without silently dropping ordinary paragraphs; Task 1 pins this.
- A failed or interrupted upload must not add a broken image node or lose unsaved text; Tasks 2 and 3 pin this.
- Legacy plain-text bodies and existing page rich-text JSON must open and save without data loss; Tasks 1, 4, and 6 pin this.
- Concurrent edits must retain the current optimistic-lock conflict instead of overwriting newer content; Task 4 pins this.
- An R2 image referenced only inside rich text must still block physical deletion; Task 5 pins this.

---

## File Structure

- `src/features/rich-text/schema.ts`: canonical HTML allow-list, normalization, legacy conversion, media-key extraction.
- `src/components/admin/RichTextEditor.ts`: TipTap lifecycle, toolbar, change callback, inline image insertion.
- `src/components/admin/media-upload.ts`: shared browser-side multipart upload function and file validation feedback.
- `src/components/admin/InlineImageUpload.ts`: file input/drop/paste UI that uploads then inserts one media node.
- `src/components/public/RichText.astro`: server-rendered sanitized rich text.
- `src/components/admin/editor.ts`: orchestrates structured controls and shared rich-text fields.
- `src/components/admin/GalleryEditor.tsx`: direct upload plus existing-media selection, ordering, alt text, cover.
- `src/features/media/repository.ts`: references embedded in body HTML and page rich-text sections.
- `src/features/catalog/schemas.ts`, `src/features/content/schemas.ts`: normalize stored rich text and validate writes.
- Public product, space, article, and managed-page renderers: use `RichText.astro`.

### Task 1: Canonical Rich-Text Contract and Sanitization

**Files:**
- Create: `src/features/rich-text/schema.ts`
- Modify: `package.json`, `package-lock.json`
- Test: `tests/unit/rich-text.test.ts`

**Interfaces:**
- Produces: `normalizeRichText(input: string): string`, `legacyTextToRichHtml(input: string): string`, `richTextMediaObjectKeys(html: string): string[]`, `isEmptyRichText(html: string): boolean`.
- Consumes: `mediaObjectKeyFromPublicUrl(value: string): string | undefined`.

- [ ] **Step 1: Install exact dependencies**

Run: `npm install @tiptap/core@3.31.3 @tiptap/starter-kit@3.31.3 @tiptap/extension-image@3.31.3 @tiptap/extension-link@3.31.3 sanitize-html@2.17.7 && npm install -D @types/sanitize-html@2.16.1`

- [ ] **Step 2: Write failing sanitizer tests**

Create table-driven tests asserting that:

```ts
expect(normalizeRichText('<h2 onclick="x()">Hello</h2><script>alert(1)</script>'))
  .toBe("<h2>Hello</h2>");
expect(normalizeRichText('<a href="javascript:alert(1)">bad</a>'))
  .toBe("<p><a>bad</a></p>");
expect(normalizeRichText('<img src="/media/00000000-0000-4000-8000-000000000000.webp" alt="Green preserved fern">'))
  .toContain('alt="Green preserved fern"');
expect(richTextMediaObjectKeys(validHtml)).toEqual(["00000000-0000-4000-8000-000000000000.webp"]);
expect(legacyTextToRichHtml("First\n\nSecond")).toBe("<p>First</p><p>Second</p>");
```

- [ ] **Step 3: Run the test and confirm the intended failure**

Run: `npm test -- --run tests/unit/rich-text.test.ts`
Expected: FAIL because `src/features/rich-text/schema.ts` does not exist.

- [ ] **Step 4: Implement the strict contract**

Use `sanitizeHtml` with allowed tags `p,h2,h3,strong,em,a,ul,ol,li,blockquote,br,img,figure,figcaption`; permit `href,target,rel` on links and `src,alt,data-media-id` on images; allow only `https`, `mailto`, and root-relative URLs; force external links to safe `rel`; remove empty wrappers; cap input at 200,000 characters and output at 160,000 characters. Escape legacy text before wrapping paragraphs.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- --run tests/unit/rich-text.test.ts && npm run typecheck`
Expected: PASS with zero errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/rich-text/schema.ts tests/unit/rich-text.test.ts
git commit -m "feat: add safe rich text contract"
```

### Task 2: Shared Direct Media Upload Client

**Files:**
- Create: `src/components/admin/media-upload.ts`
- Modify: `src/components/admin/MediaLibrary.tsx`, `src/components/admin/MediaPicker.tsx`
- Test: `tests/unit/admin-media-upload.test.ts`

**Interfaces:**
- Produces: `uploadAdminImage(file: File, altText: string, signal?: AbortSignal): Promise<MediaItem>`.
- Consumes: existing `POST /api/admin/media` response and `MediaItem`.

- [ ] **Step 1: Write a failing upload-client test**

Stub `fetch` at the HTTP boundary and assert a `FormData` request contains `file` and `altText`, returns the real API media object, maps 422 field errors to a typed `MediaUploadError`, and propagates `AbortError` without changing it.

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- --run tests/unit/admin-media-upload.test.ts`
Expected: FAIL because `uploadAdminImage` is missing.

- [ ] **Step 3: Implement and reuse the upload client**

Move duplicated multipart behavior from `MediaLibrary.tsx` into `media-upload.ts`. Keep file size and magic-byte enforcement on the server; client validation only improves feedback. Add an optional upload button at the top of `MediaPicker` so a newly uploaded item can be selected immediately.

- [ ] **Step 4: Verify success, 422, abort, and picker insertion**

Run: `npm test -- --run tests/unit/admin-media-upload.test.ts tests/integration/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/media-upload.ts src/components/admin/MediaLibrary.tsx src/components/admin/MediaPicker.tsx tests/unit/admin-media-upload.test.ts
git commit -m "feat: share direct admin image upload"
```

### Task 3: TipTap RichTextEditor with Inline Upload

**Files:**
- Create: `src/components/admin/RichTextEditor.ts`
- Create: `src/components/admin/InlineImageUpload.ts`
- Modify: `src/styles/admin.css`
- Test: `tests/unit/rich-text-editor.test.ts`

**Interfaces:**
- Produces: `mountRichTextEditor(root, { value, onChange, onUploadStateChange }): RichTextEditorController` where the controller has `getHtml()`, `setHtml(html)`, `focus()`, and `destroy()`.
- Consumes: `uploadAdminImage`, `normalizeRichText`, and TipTap extensions.

- [ ] **Step 1: Write failing DOM tests**

Test toolbar creation, initial legacy HTML, bold/list/link commands, sanitized paste, direct file insertion, upload failure preserving prior content, and `destroy()` removing listeners. Assert `onUploadStateChange(true)` prevents save while an upload is pending.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/rich-text-editor.test.ts`
Expected: FAIL because the editor adapter does not exist.

- [ ] **Step 3: Implement the minimal editor**

Configure `StarterKit`, `Link`, and an `Image` extension carrying `src`, `alt`, and `data-media-id`. Build a Chinese toolbar for paragraph, H2, H3, bold, italic, lists, quote, link, undo, redo, and image. Handle file picker, drop, and clipboard images through the same uploader; insert only after a successful response.

- [ ] **Step 4: Add admin-only styling**

Style a clear toolbar, focus state, editable canvas, image cards, progress, errors, and mobile stacking entirely in `admin.css`. Do not import editor modules from public layouts.

- [ ] **Step 5: Run focused tests and production build**

Run: `npm test -- --run tests/unit/rich-text-editor.test.ts && npm run build`
Expected: PASS; public entry chunks contain no TipTap imports.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/RichTextEditor.ts src/components/admin/InlineImageUpload.ts src/styles/admin.css tests/unit/rich-text-editor.test.ts
git commit -m "feat: add visual rich text editor"
```

### Task 4: Integrate Structured Fields, Rich Text, and Save Lifecycle

**Files:**
- Modify: `src/components/admin/editor.ts`
- Modify: `src/features/catalog/schemas.ts`
- Modify: `src/features/content/schemas.ts`
- Modify: `src/features/admin-content/schemas.ts`
- Test: `tests/unit/admin-editor.test.ts`
- Test: `tests/integration/admin-content-api.test.ts`

**Interfaces:**
- Consumes: `mountRichTextEditor`, `normalizeRichText`, `legacyTextToRichHtml`.
- Produces: normalized `body` HTML for products, spaces, and articles; rich-text documents inside managed page sections; unchanged optimistic-lock payloads.

- [ ] **Step 1: Write failing editor and API tests**

Assert product, space, and article body fields mount visual editors rather than textareas; legacy plain text opens as paragraphs; pending upload disables save/publish; server payloads strip scripts and reject over-limit rich text; a stale `updatedAt` still returns 409 without changing content.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/admin-editor.test.ts tests/integration/admin-content-api.test.ts`
Expected: FAIL on missing rich-text behavior.

- [ ] **Step 3: Add `kind: "richText"` and controller lifecycle**

Mark `body` fields for products, spaces, and articles as rich text. Mount after the form DOM exists, mirror sanitized HTML into a hidden named control for existing `readForm`, set dirty state through `onChange`, block actions during uploads, and destroy all editor controllers when closing.

- [ ] **Step 4: Normalize at server boundaries**

Apply `normalizeRichText` in create/update schemas and use `legacyTextToRichHtml` when reading bodies that contain no HTML tags. Preserve current API envelopes and field names.

- [ ] **Step 5: Verify editor, API, and conflict behavior**

Run: `npm test -- --run tests/unit/admin-editor.test.ts tests/integration/admin-content-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/editor.ts src/features/catalog/schemas.ts src/features/content/schemas.ts src/features/admin-content/schemas.ts tests/unit/admin-editor.test.ts tests/integration/admin-content-api.test.ts
git commit -m "feat: integrate rich text content editing"
```

### Task 5: Rich-Text Media References and Deletion Protection

**Files:**
- Modify: `src/features/media/repository.ts`
- Modify: `src/features/media/service.ts`
- Modify: `src/features/admin-content/repository.ts`
- Test: `tests/integration/media.test.ts`

**Interfaces:**
- Consumes: `richTextMediaObjectKeys(html)`.
- Produces: reference checks covering product body, space body, article body, and managed-page rich-text content.

- [ ] **Step 1: Write failing reference tests**

Upload one R2 image, place its `/media/<key>` URL only inside each supported rich-text body, then assert deletion returns `409 media_referenced`. Remove the reference and assert deletion succeeds. Add a race test showing save loses atomically if deletion wins.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/integration/media.test.ts`
Expected: FAIL because body HTML is not included in reference lookup.

- [ ] **Step 3: Implement reference extraction and validation**

At content save, map extracted object keys to active media rows and reject missing/deleted objects. Extend deletion preflight and transactional recheck to scan normalized bodies and page sections without trusting client `data-media-id` alone.

- [ ] **Step 4: Run media and content integration tests**

Run: `npm test -- --run tests/integration/media.test.ts tests/integration/admin-content-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/media/repository.ts src/features/media/service.ts src/features/admin-content/repository.ts tests/integration/media.test.ts tests/integration/admin-content-api.test.ts
git commit -m "feat: protect inline content media"
```

### Task 6: Managed Page Visual Sections

**Files:**
- Create: `src/components/admin/PageSectionsEditor.ts`
- Modify: `src/components/admin/editor.ts`
- Modify: `src/features/content/schemas.ts`
- Modify: `src/components/public/PageSections.astro`
- Test: `tests/unit/page-sections-editor.test.ts`
- Test: `tests/integration/admin-content-api.test.ts`

**Interfaces:**
- Produces: `mountPageSectionsEditor(root, { value, onChange, onUploadStateChange })` returning the same lifecycle shape as `RichTextEditorController`.
- Consumes: `RichTextEditor`, direct media upload, and current `PageBlock` union.

- [ ] **Step 1: Write failing page-section tests**

Assert existing hero, rich-text, image-text, capabilities, CTA, and contact blocks render as Chinese forms; blocks can be reordered; images upload inline; old JSON loads unchanged; unsupported or malformed blocks are rejected rather than dropped.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/page-sections-editor.test.ts`
Expected: FAIL because the visual sections editor is absent.

- [ ] **Step 3: Implement visual block editing**

Replace the raw sections JSON textarea with block cards and an “添加区块” menu. Use `RichTextEditor` inside rich-text blocks and direct media controls inside hero/image-text blocks. Serialize through existing `parsePageBlocks` before updating the hidden form control.

- [ ] **Step 4: Expand safe page rich text**

Extend the page rich-text document schema to the approved headings, marks, lists, links, quotes, and image nodes, with bounded depth/node counts and media alt validation. Update `PageSections.astro` to render the same safe node set.

- [ ] **Step 5: Verify unit, API, and public rendering**

Run: `npm test -- --run tests/unit/page-sections-editor.test.ts tests/unit/content.test.ts tests/integration/admin-content-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/PageSectionsEditor.ts src/components/admin/editor.ts src/features/content/schemas.ts src/components/public/PageSections.astro tests/unit/page-sections-editor.test.ts tests/unit/content.test.ts tests/integration/admin-content-api.test.ts
git commit -m "feat: add visual managed page editor"
```

### Task 7: Direct Cover and Gallery Upload in the Same Editor

**Files:**
- Modify: `src/components/admin/editor.ts`
- Modify: `src/components/admin/GalleryEditor.tsx`
- Modify: `src/styles/admin.css`
- Test: `tests/unit/admin-gallery-editor.test.ts`
- Test: `tests/integration/media.test.ts`

**Interfaces:**
- Consumes: `uploadAdminImage`, `openMediaPicker`.
- Produces: immediate cover upload for categories/articles and direct gallery upload for products/spaces.

- [ ] **Step 1: Write failing UI tests**

Assert cover controls show thumbnail, “直接上传”, “选择已有图片”, alt text, and clear; gallery accepts multiple selected files, preserves selection order, supports drag reorder and keyboard up/down, assigns the first image as default cover, and leaves existing items intact when one upload fails.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/admin-gallery-editor.test.ts`
Expected: FAIL on missing direct-upload controls.

- [ ] **Step 3: Implement integrated cover and gallery controls**

Reuse the shared uploader. Keep explicit “保存图库” until content exists; for a new product/space, save the structured draft first, then enable gallery uploads without leaving the editor. Revoke temporary object URLs and preserve server media URLs.

- [ ] **Step 4: Verify gallery persistence and accessibility**

Run: `npm test -- --run tests/unit/admin-gallery-editor.test.ts tests/integration/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/editor.ts src/components/admin/GalleryEditor.tsx src/styles/admin.css tests/unit/admin-gallery-editor.test.ts tests/integration/media.test.ts
git commit -m "feat: upload covers and galleries in editor"
```

### Task 8: Safe Public Rendering and End-to-End Acceptance

**Files:**
- Create: `src/components/public/RichText.astro`
- Modify: `src/pages/products/[slug].astro`
- Modify: `src/pages/spaces/[slug].astro`
- Modify: `src/pages/journal/[slug].astro`
- Modify: `src/styles/public.css`
- Modify: `tests/e2e/admin-content.spec.ts`
- Modify: `tests/e2e/content.spec.ts`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: normalized server-owned rich-text HTML and `RichText.astro`.
- Produces: consistent English public rendering and complete operational workflow.

- [ ] **Step 1: Write failing browser acceptance tests**

For product, space, article, and managed page: create a draft, enter formatted text, upload a small fixture image from the editor, set alt text, preview, publish, and assert the public page renders headings/lists/image without script or inline style. Assert the workflow never navigates to `/admin/media`.

- [ ] **Step 2: Verify RED**

Run: `npm run test:e2e -- tests/e2e/admin-content.spec.ts tests/e2e/content.spec.ts`
Expected: FAIL until public renderers use the new rich-text component.

- [ ] **Step 3: Implement safe public rendering**

Create `RichText.astro` that renders only normalized server output via `set:html`; callers must pass values already returned by the normalization layer. Replace newline splitting on product, space, and article details. Add scoped typography and responsive inline-image styles.

- [ ] **Step 4: Document the new operational flow**

Update the Chinese deployment guide with dependency installation, R2 binding requirements, supported editor formats, image limits, and the rule that media deletion remains separate and reference-protected.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
npm run test:smoke
```

Expected: zero type errors, all unit/integration/E2E/smoke tests pass, and the production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/public/RichText.astro src/pages/products/'[slug].astro' src/pages/spaces/'[slug].astro' src/pages/journal/'[slug].astro' src/styles/public.css tests/e2e/admin-content.spec.ts tests/e2e/content.spec.ts docs/deployment.md
git commit -m "feat: ship integrated content editing workflow"
```

### Task 9: Final Security and Branch Review

**Files:**
- Review: all changes since `5177451`
- Test: complete repository suite

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: release-ready branch with no unresolved review findings.

- [ ] **Step 1: Review dependency and bundle boundaries**

Run `npm ls @tiptap/core sanitize-html` and inspect `dist/_astro` after build. Confirm exact supported versions, one TipTap copy, no editor imports in public entry chunks, and no `.dev.vars` or secrets in output.

- [ ] **Step 2: Review hostile and failure inputs**

Re-run the five Review Focus cases explicitly: hostile paste, interrupted upload, legacy content, stale update, and inline-only media reference deletion.

- [ ] **Step 3: Run final verification**

Run `npm run typecheck && npm test -- --run && npm run build && npm run test:e2e && npm run test:smoke`.
Expected: every command exits 0.

- [ ] **Step 4: Address review findings with focused tests**

For each finding, first add the smallest failing test to the owning task’s test file, then implement only the required correction and rerun that test plus the full suite.

- [ ] **Step 5: Commit final corrections if needed**

```bash
git add -A
git commit -m "fix: address integrated editor review"
```
