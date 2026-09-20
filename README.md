# EVERSTEM

EVERSTEM is an English public wholesale botanical website with a Chinese administration console. It runs on Astro and Cloudflare Pages, stores structured content in D1, and stores uploaded media in R2.

## Local start

Requirements: Node.js 20 or newer, npm 10 or newer, and a Cloudflare account only when you are ready to create remote resources.

```bash
npm clean-install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run admin:create -- --email you@example.com
npm run dev
```

Open the public site at `http://127.0.0.1:4321` and the Chinese admin at `http://127.0.0.1:4321/admin`.

## Checks

```bash
npm run typecheck
npm test -- --run
npm run test:e2e
npm run test:smoke
npm run build
```

The detailed Cloudflare Pages, D1, R2, GitHub, backup, rollback, and credential-rotation instructions are in [docs/deployment.md](docs/deployment.md).

No production IDs or credentials are committed. Replace the clearly marked D1 placeholders in `wrangler.toml` and configure secrets in Cloudflare before deployment.
Export `EVERSTEM_ADMIN_PASSWORD` only for the administrator-creation command and `E2E_ADMIN_PASSWORD` only for browser tests; use values from your password manager and clear them from the shell afterwards.
