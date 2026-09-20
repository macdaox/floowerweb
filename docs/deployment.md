# Cloudflare deployment runbook

This project deploys to Cloudflare Pages with D1 (`DB`) and R2 (`MEDIA`). Production and preview must use separate databases and buckets. GitHub `main` is the production branch; pull requests create previews.

Before release, run `npm run test:smoke`. It creates the production build, prepares the local D1 seed, starts `wrangler pages dev ./dist` with local D1/R2 bindings, and checks critical public and admin-login routes against that built output.

## 1. Prepare the repository

Use Node.js 20+ and npm 10+.

```bash
npm clean-install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run admin:create -- --email you@example.com
npm run dev
```

`.dev.vars` is ignored by Git. Generate `SESSION_SECRET` with a cryptographically secure password manager or `openssl rand -base64 48`; never reuse an admin password. Export `EVERSTEM_ADMIN_PASSWORD` from your password manager immediately before the administrator command, then unset it.

## 2. Create Cloudflare resources

Authenticate Wrangler, then create distinct preview and production resources:

```bash
npx wrangler login
npx wrangler d1 create everstem-preview
npx wrangler d1 create everstem-production
npx wrangler r2 bucket create everstem-media-preview
npx wrangler r2 bucket create everstem-media-production
```

Copy the two returned D1 UUIDs into the matching `database_id` placeholders in `wrangler.toml`. Do not commit account tokens or secrets. The bucket names are already declared there; change them only if you created different names.

Apply migrations and seed each remote database deliberately:

```bash
npm run db:migrate:remote
npm run db:seed:remote
npm run db:migrate:remote -- --env production
npm run db:seed:remote -- --env production
```

Create the first administrator in each environment. The command hashes the password locally, never prints it, and refuses to create a second initial administrator:

```bash
npm run admin:create -- --remote --email admin@example.com
npm run admin:create -- --remote --email admin@example.com --env production
```

Always verify the Wrangler target database before entering a production password.

## 3. Connect GitHub to Pages

In Cloudflare Dashboard, create a Pages project from this GitHub repository:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20`
- Preview deployments: enabled for pull requests

For Preview bindings, attach `DB` to `everstem-preview` and `MEDIA` to `everstem-media-preview`. For Production bindings, attach `DB` to `everstem-production` and `MEDIA` to `everstem-media-production`.

Set these variables separately in both Pages environments:

- Secret `SESSION_SECRET`: a different random value per environment, at least 32 random bytes.
- Variable `PUBLIC_SITE_URL`: the canonical HTTPS origin for that environment, with no path.
- Variable `MEDIA_MAX_BYTES`: `10485760` unless you intentionally change the upload policy.
- Optional variable `PUBLIC_IMAGE_RESIZING_ORIGIN`: only an HTTPS origin where Cloudflare Image Resizing is enabled and `/media/*` resolves to this application.

`PUBLIC_SITE_URL` is mandatory outside local Astro development. Canonical links, Open Graph URLs, JSON-LD, `robots.txt`, and the sitemap use only this configured value and never trust the request Host header. Missing or invalid production configuration fails closed.

## 4. Domain and media

Add the production custom domain in Pages, update DNS as Cloudflare instructs, then set `PUBLIC_SITE_URL` to that exact `https://` origin and redeploy. Uploaded objects remain private in R2 and are served by the application through `/media/*`; do not expose the bucket publicly. Referenced media cannot be physically deleted from the admin console.

Image Resizing is optional. Without it, dynamic R2 images safely use their original URL. Bundled design imagery already has checked-in responsive variants under `public/assets/responsive/`.

## 5. Release verification

Before merging or deploying:

```bash
npm clean-install
npm run db:migrate:local
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
```

After deployment, verify `/`, `/collections`, `/about`, `/contact`, `/wholesale`, `/admin/login`, and `/health`; submit one test inquiry and confirm it appears in the Chinese admin without sending email. Confirm the public sitemap contains no drafts, admin URLs, notes, hashes, session digests, or secrets.

## 6. Backups, rollback, and rotation

Before every migration or significant content release, export each D1 database:

```bash
npx wrangler d1 export DB --remote --output backup-preview.sql
npx wrangler d1 export DB --remote --env production --output backup-production.sql
```

Store exports in encrypted storage outside Git. R2 object versioning or scheduled copies should be configured in Cloudflare according to your retention policy.

For application rollback, use Pages Deployments to roll back to the last known-good deployment. Do not reverse a D1 migration by deleting tables or files. Restore into a new D1 database from the verified export, update the binding, test, and then switch traffic.

Rotate `SESSION_SECRET` in the affected Pages environment and redeploy; all existing admin sessions become invalid. Rotate an admin password by logging in as another administrator and updating the account. Rotate Cloudflare API tokens in the dashboard and update CI secrets; never place them in `.dev.vars`, source files, logs, or GitHub Actions output.
