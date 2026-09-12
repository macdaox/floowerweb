# EVERSTEM Full-Stack Website Design

Date: 2026-09-13
Status: Approved in chat; awaiting final review of this written specification

## 1. Goal

Turn the existing single-page EVERSTEM HTML demo into a production-ready B2B website and content-management system. Preserve its refined botanical visual language while adding structured products, case studies, journal content, editable pages, media management, inquiries, subscriptions, authentication, and a deployment workflow for GitHub and Cloudflare Pages.

The first release is English-only. The content model will reserve explicit locale and translation-link fields so that Chinese can be added later without replacing existing English URLs or restructuring the database.

## 2. Scope

### Public website

- Home
- Collections and category pages
- Product detail pages with product inquiries and no public pricing
- Spaces/case-study listing and detail pages
- Journal listing and article pages
- About Us
- Contact Us
- Wholesale and catalog request
- Privacy and Terms
- Newsletter subscription
- Responsive navigation and footer
- SEO metadata, sitemap, canonical URLs, Open Graph data, and structured data

### Management application

- Dashboard
- Products and categories
- Spaces/case studies
- Journal articles
- Editable page sections for Home, About Us, Contact Us, Wholesale, Privacy, and Terms
- Inquiry pipeline and internal notes
- Subscribers and CSV export
- R2 media library
- Users and roles
- Site settings and default SEO
- Audit history for sensitive actions

### Out of scope for the first release

- Public prices, cart, checkout, and online payments
- Automated emails to customers or salespeople
- Cloudflare Access
- Chinese public pages
- Mandatory CAPTCHA or an external image-processing service

## 3. Architecture

Use one GitHub repository and one Astro application deployed to Cloudflare Pages.

- Astro renders public pages as HTML for performance and search visibility.
- React islands provide rich interactions where needed, primarily in `/admin`.
- Astro API routes run in the Cloudflare Pages Functions runtime under `/api/*`.
- D1 stores structured content, users, sessions, inquiries, subscribers, and audit data.
- R2 stores original uploaded images; D1 stores media metadata and object keys.
- `wrangler` configuration declares Pages bindings, environments, and the compatibility date.
- Preview and production deployments use separate D1 databases and R2 buckets.

The project must remain compatible with Cloudflare Pages even though Cloudflare recommends Workers as the default platform for many new applications.

## 4. Public Information Architecture

### Routes

- `/`
- `/collections`
- `/collections/[category]`
- `/products/[slug]`
- `/spaces`
- `/spaces/[slug]`
- `/journal`
- `/journal/[slug]`
- `/about`
- `/contact`
- `/wholesale`
- `/privacy`
- `/terms`

### Navigation

The primary navigation contains Home, Collections, Spaces, Journal, About Us, Contact Us, and a visually prominent Wholesale/Request Catalog action. Desktop uses a restrained horizontal navigation. Mobile uses an accessible full-screen or large drawer menu. Header colors adapt to the opening background of each page.

### Page composition

The home page retains the demo's hero, brand statement, collection grid, spaces, craft/detail, journal, wholesale, and inquiry themes. Each summary links to a complete page.

Product details include a gallery, product name, product code, category, description, specifications, related products, and an inquiry form. No price is displayed.

About Us covers the brand story, design position, production process, quality control, customization, and global supply capability. Contact Us contains company details, social links, and a general inquiry form. Wholesale covers collections, private label, sampling and development, packaging, export supply, and catalog requests.

## 5. Visual and Interaction Design

Retain the demo's ivory, stone, brown, and olive palette; editorial serif display type; clean sans-serif body type; oversized botanical imagery; asymmetric grids; fine rules; and restrained reveal and image-scale motion.

All layouts must work on mobile, tablet, and desktop. The implementation will preserve semantic HTML, visible focus states, keyboard operation, descriptive alternative text, and `prefers-reduced-motion` behavior.

Primary content is server-rendered. Images use explicit dimensions, responsive sources where available, lazy loading below the fold, and special treatment for the leading image. R2 assets are served through a public custom domain or a controlled media route. Optional Cloudflare image transformations may improve delivery when available but are not required for launch.

## 6. Data Model

All primary records use stable IDs and timestamps. Content records include status, locale, optional translation-group identity, and SEO fields where relevant.

- `users`: email/username, display name, password hash, role, active state, last login
- `sessions`: opaque token digest, user, expiry, IP metadata, user-agent metadata
- `categories`: localized name, slug, description, image, ordering, status
- `products`: localized name, slug, product code, summary, body, structured specifications, category, cover image, SEO, status
- `product_images`: product, media item, alternative text, ordering, cover flag
- `spaces`: localized title, slug, category, location, summary, body, cover image, SEO, status
- `space_images`: space, media item, alternative text, ordering
- `articles`: localized title, slug, summary, body, author, cover image, publish date, SEO, status
- `pages`: page key, locale, modular sections, SEO, status
- `media`: R2 object key, original filename, MIME type, byte size, dimensions, alternative text, deletion state
- `inquiries`: inquiry type, customer details, company, country/market, buyer type, interests, message, related product, source route, assignee, status
- `inquiry_notes`: inquiry, author, note, timestamp
- `subscribers`: email, source, subscription state, timestamps
- `settings`: company details, contact data, social links, default SEO
- `audit_logs`: actor, action, entity, entity ID, timestamp, non-secret context

Content lifecycle states are `draft`, `published`, and `archived`. Inquiry states are `new`, `contacted`, `qualified`, `closed`, and `spam`.

Content deletion is archival or soft deletion by default. An R2 object cannot be physically deleted while referenced by published or draft content.

## 7. Administration and Roles

### Routes and modules

- `/admin/login`
- `/admin` dashboard
- Products and Categories
- Spaces
- Journal
- Pages
- Inquiries
- Subscribers
- Media
- Users
- Settings

Lists support search, filters, ordering, pagination, and appropriate batch archival. Content editing supports draft, preview, publish, unpublish, and archive actions. Galleries support ordering, cover selection, and alternative text. Inquiry details support assignment, internal notes, and status transitions.

### Roles

- `admin`: full access, including users and settings
- `editor`: products, categories, pages, spaces, articles, and media
- `sales`: inquiries, assignments, notes, status changes, and customer export

Authorization is enforced by the server for every protected API operation; hidden navigation is not considered an access-control mechanism.

## 8. Authentication and Security

The public website is unrestricted. `/admin` uses application-managed username/password authentication and does not require Cloudflare Access.

- Passwords use a Workers-compatible, salted, computationally expensive password-hashing scheme and are never stored or logged in plaintext.
- Successful login creates an opaque random session. Only a digest is stored in D1.
- The browser receives an `HttpOnly`, `Secure`, `SameSite=Lax` cookie with a bounded lifetime.
- Logout and administrative revocation invalidate sessions.
- Login uses generic errors and rate limiting to reduce account enumeration and brute-force attempts.
- Mutating admin requests validate allowed origins and use CSRF protection appropriate to the cookie/session design.
- Inputs are schema-validated on the server with strict type and length limits.
- Important login, publish, archive, delete, role, and user operations create audit entries without secrets.
- The first administrator is created by a one-time local initialization command using environment variables. Credentials are excluded from Git.

## 9. Media Workflow

1. An authorized editor selects or drops a JPG, PNG, WebP, or AVIF image.
2. The server verifies the session, role, MIME type, extension, and size.
3. The file is stored under an unpredictable R2 object key.
4. D1 receives a media record only after storage succeeds.
5. The editor supplies meaningful English alternative text and may select, order, or reuse the image.
6. Deletion first checks content references. Referenced assets remain protected; safe deletion removes or marks both the object and index consistently.

Original images are retained. Upload and content-save operations are separate so either can be retried without creating incomplete published content.

## 10. API Boundaries

- `/api/auth/*`: login, logout, current user, password change
- `/api/public/*`: public products, categories, spaces, articles, pages, and settings when an explicit JSON endpoint is required
- `/api/inquiries`: product inquiry, contact inquiry, and catalog request creation
- `/api/subscribers`: subscription creation
- `/api/admin/products/*` and `/api/admin/categories/*`
- `/api/admin/spaces/*`
- `/api/admin/articles/*`
- `/api/admin/pages/*`
- `/api/admin/media/*`
- `/api/admin/inquiries/*`
- `/api/admin/subscribers/*`
- `/api/admin/users/*`
- `/api/admin/settings/*`

Server-rendered public pages may query D1 directly through the application's service layer rather than making a loopback HTTP request to the public API.

JSON endpoints use a consistent response envelope and meaningful HTTP status codes. Public submission endpoints use a honeypot, rate limiting, validation, and duplicate-submit protection. Turnstile remains an optional follow-up if real traffic produces excessive spam.

## 11. Inquiry Workflow

Product inquiries, general contact forms, catalog requests, and newsletter subscriptions write to D1. The system sends no automatic email in the first release.

New inquiries appear on the dashboard and in the inquiry list. Salespeople filter by type, status, assignee, date, market, and product; open the full submission; add private notes; assign ownership; change status; and manually contact the prospect using their normal email tools.

The system records the source route and related product when applicable so salespeople retain context.

## 12. Error Handling and Consistency

- The public site provides on-brand 404 and 500 pages.
- Forms preserve entered values on recoverable errors and expose loading, success, and failure states accessibly.
- Protected APIs return 401 for missing/expired authentication and 403 for insufficient roles.
- Database and storage operations use ordered writes and compensating cleanup where atomic cross-service transactions are impossible.
- Failed uploads or saves can be retried without publishing partial records.
- User-facing errors are concise; diagnostic detail goes only to server logs.
- Destructive actions require confirmation and default to archival.

## 13. SEO and Performance

- Human-readable stable English slugs
- Per-record title, description, canonical URL, and social image
- Automatic sitemap and robots policy
- Organization, Product, Article, and Breadcrumb structured data where applicable
- Server-rendered meaningful page HTML
- Responsive, dimensioned, lazy-loaded imagery
- Minimal JavaScript on public pages; richer JavaScript restricted to interactive islands and admin workflows

## 14. Testing and Quality Gates

- Unit tests for validation, authorization, slugs, content mapping, and security utilities
- API integration tests for authentication, role boundaries, CRUD, inquiries, subscriptions, and rejected input
- D1 migration and constraint tests against the local Cloudflare database runtime
- Browser tests for navigation, lists, product detail, forms, login, inquiry workflow, and core content editing
- Responsive visual checks on representative mobile, tablet, and desktop widths
- Accessibility checks for keyboard flow, labels, focus, contrast, and reduced motion
- A production build and a local Pages Functions run with D1/R2 bindings before completion

## 15. Repository and Deployment

- One repository contains the public site, admin application, API code, D1 migrations, tests, configuration, and documentation.
- `main` deploys production through Cloudflare Pages Git integration.
- Pull requests create preview deployments.
- Preview and production have distinct D1 and R2 bindings.
- Versioned SQL migration files are committed and applied deliberately per environment.
- Local secrets live in ignored environment files; no administrator password, signing secret, or production identifier is committed.
- The README documents installation, local development, administrator initialization, D1/R2 creation, migration application, test commands, build settings, and Pages deployment.

Remote repository creation and production deployment require a separate explicit request and an authenticated GitHub/Cloudflare environment.

## 16. Acceptance Criteria

- The existing visual identity is recognizably preserved and works across target screen sizes.
- Every defined public route renders real D1-backed content and appropriate empty/not-found states.
- Authorized users can manage all agreed content and media without editing source files.
- Sales users can manage the complete inquiry workflow without automatic emails.
- Public visitors cannot access protected data or mutations.
- The project builds and runs with Cloudflare Pages Functions, D1, and R2 in local and configured cloud environments.
- A fresh checkout can be configured and deployed by following the README without undocumented steps.
