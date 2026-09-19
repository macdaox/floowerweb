import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../../src/features/auth/password";

const E2E_USERS = [
  { id: "e2e-admin", email: "e2e-admin@everstem.test", username: "e2e-admin", displayName: "E2E Admin", role: "admin" },
  { id: "e2e-editor", email: "e2e-editor@everstem.test", username: "e2e-editor", displayName: "E2E Editor", role: "editor" },
  { id: "e2e-sales", email: "e2e-sales@everstem.test", username: "e2e-sales", displayName: "E2E Sales", role: "sales" },
  { id: "e2e-managed", email: "e2e-managed@everstem.test", username: "e2e-managed", displayName: "E2E Managed User", role: "editor" },
] as const;

export default async function globalSetup(): Promise<void> {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error("E2E_ADMIN_PASSWORD must be set for authenticated browser tests.");

  const directory = await mkdtemp(join(tmpdir(), "everstem-e2e-"));
  const sqlFile = join(directory, "fixtures.sql");
  try {
    exec("d1", "migrations", "apply", "DB", "--local");
    const passwordHash = await hashPassword(password);
    await writeFile(sqlFile, fixtureSql(passwordHash));
    exec("d1", "execute", "DB", "--local", "--file", sqlFile);
    seedFixtureMedia();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function seedFixtureMedia(): void {
  for (const suffix of ["102", "103", "104", "105"]) {
    const key = `00000000-0000-4000-8000-000000000${suffix}.jpg`;
    exec("r2", "object", "put", `everstem-media-preview/${key}`, "--local", "--file", "public/assets/everstem-magnolia-v2.jpg", "--content-type", "image/jpeg");
  }
}

function exec(...args: string[]): void {
  execFileSync("npx", ["wrangler", ...args], { stdio: "ignore" });
}

function fixtureSql(passwordHash: string): string {
  const now = "2099-01-01T00:00:00.000Z";
  const users = E2E_USERS.map((user) => `INSERT INTO users (id, email, username, display_name, password_hash, role, is_active, created_at, updated_at)
VALUES (${sql(user.id)}, ${sql(user.email)}, ${sql(user.username)}, ${sql(user.displayName)}, ${sql(passwordHash)}, ${sql(user.role)}, 1, ${sql(now)}, ${sql(now)})
ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, password_hash = excluded.password_hash, role = excluded.role, is_active = 1, updated_at = excluded.updated_at;`).join("\n");
  const inquiryRows = [
    ["e2e-dashboard-01", "张一", "zhang1@example.test", "新询盘", "new", "2099-01-01T00:00:06.000Z"],
    ["e2e-dashboard-02", "李二", "li2@example.test", "联系公司", "contacted", "2099-01-01T00:00:05.000Z"],
    ["e2e-dashboard-03", "王三", "wang3@example.test", "项目公司", "new", "2099-01-01T00:00:04.000Z"],
    ["e2e-dashboard-04", "赵四", "zhao4@example.test", "采购公司", "qualified", "2099-01-01T00:00:03.000Z"],
    ["e2e-dashboard-05", "周五", "zhou5@example.test", "设计公司", "closed", "2099-01-01T00:00:02.000Z"],
    ["e2e-dashboard-06", "<img src=x>", "safe@example.test", "文本安全", "new", "2099-01-01T00:00:01.000Z"],
    ...Array.from({ length: 18 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return [`e2e-dashboard-page-${suffix}`, `E2E Page Inquiry ${suffix}`, `page-${suffix}@example.test`, "Pagination Co", "new", `2098-12-${String(31 - index).padStart(2, "0")}T00:00:00.000Z`];
    }),
    ["e2e-dashboard-later", "E2E Later Inquiry", "later-inquiry@example.test", "Later Co", "new", "2000-01-01T00:00:00.000Z"],
  ];
  const inquiries = inquiryRows.map(([id, name, email, company, status, timestamp]) => `INSERT INTO inquiries (id, inquiry_type, name, email, company, source_route, status, created_at, updated_at)
VALUES (${sql(id)}, 'catalog', ${sql(name)}, ${sql(email)}, ${sql(company)}, '/__e2e__/dashboard', ${sql(status)}, ${sql(timestamp)}, ${sql(timestamp)});`).join("\n");
  const bulkCategories = Array.from({ length: 105 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return `INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
VALUES (${sql(`e2e-bulk-category-${suffix}`)}, 'en', ${sql(`E2E Bulk Category ${suffix}`)}, ${sql(`e2e-bulk-category-${suffix}`)}, ${index + 1}, 'draft', ${sql(now)}, ${sql(now)});`;
  }).join("\n");
  const bulkSpaces = Array.from({ length: 105 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return `INSERT INTO spaces (id, locale, title, slug, category, status, created_at, updated_at)
VALUES (${sql(`e2e-bulk-space-${suffix}`)}, 'en', ${sql(`E2E Bulk Space ${suffix}`)}, ${sql(`e2e-bulk-space-${suffix}`)}, ${sql(`E2E Space Category ${suffix}`)}, 'draft', ${sql(now)}, ${sql(now)});`;
  }).join("\n");
  const bulkMedia = Array.from({ length: 105 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    const uuidTail = String(index + 1).padStart(12, "0");
    return `INSERT INTO media (id, object_key, original_filename, mime_type, byte_size, alt_text, is_deleted, created_at, updated_at)
VALUES (${sql(`e2e-bulk-media-${suffix}`)}, ${sql(`00000000-0000-4000-8000-${uuidTail}.jpg`)}, ${sql(`E2E Bulk Media ${suffix}.jpg`)}, 'image/jpeg', 10, ${sql(`E2E bulk magnolia image ${suffix}`)}, 0, '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z');`;
  }).join("\n");
  const clampMedia = Array.from({ length: 97 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    const uuidTail = String(index + 1).padStart(12, "0");
    return `INSERT INTO media (id, object_key, original_filename, mime_type, byte_size, alt_text, is_deleted, created_at, updated_at)
VALUES (${sql(`e2e-clamp-media-${suffix}`)}, ${sql(`10000000-0000-4000-8000-${uuidTail}.jpg`)}, ${sql(`E2E Clamp Media ${suffix}.jpg`)}, 'image/jpeg', 10, ${sql(`E2E final page clamp image ${suffix}`)}, 0, '2000-01-02T00:00:00.000Z', '2000-01-02T00:00:00.000Z');`;
  }).join("\n");
  const assignmentAltFixtures = `INSERT INTO categories (id, locale, name, slug, sort_order, status, created_at, updated_at)
VALUES ('e2e-alt-category', 'en', 'E2E assignment collection', 'e2e-assignment-collection', 999, 'published', ${sql(now)}, ${sql(now)});
INSERT INTO products (id, locale, name, slug, product_code, summary, body, specifications_json, category_id, cover_media_id, status, created_at, updated_at)
VALUES ('e2e-alt-product-primary', 'en', 'E2E assignment primary', 'e2e-alt-product-primary', 'E2E-ALT-PRIMARY', 'Primary summary', 'Primary body', '{}', 'e2e-alt-category', 'e2e-bulk-media-105', 'published', ${sql(now)}, ${sql(now)});
INSERT INTO products (id, locale, name, slug, product_code, summary, body, specifications_json, category_id, cover_media_id, status, created_at, updated_at)
VALUES ('e2e-alt-product-related', 'en', 'E2E assignment related', 'e2e-alt-product-related', 'E2E-ALT-RELATED', 'Related summary', 'Related body', '{}', 'e2e-alt-category', 'e2e-bulk-media-104', 'published', ${sql(now)}, ${sql(now)});
INSERT INTO product_images (id, product_id, media_id, alt_text, sort_order, is_cover, created_at)
VALUES ('e2e-alt-product-primary-cover', 'e2e-alt-product-primary', 'e2e-bulk-media-105', 'Primary product assignment alt', 0, 1, ${sql(now)});
INSERT INTO product_images (id, product_id, media_id, alt_text, sort_order, is_cover, created_at)
VALUES ('e2e-alt-product-primary-detail', 'e2e-alt-product-primary', 'e2e-bulk-media-104', 'Primary product detail assignment alt', 1, 0, ${sql(now)});
INSERT INTO product_images (id, product_id, media_id, alt_text, sort_order, is_cover, created_at)
VALUES ('e2e-alt-product-related-cover', 'e2e-alt-product-related', 'e2e-bulk-media-104', 'Related product assignment alt', 0, 1, ${sql(now)});
INSERT INTO spaces (id, locale, title, slug, category, summary, body, cover_media_id, status, created_at, updated_at)
VALUES ('e2e-alt-space-primary', 'en', 'E2E assignment primary space', 'e2e-alt-space-primary', 'E2E Assignment Spaces', 'Primary space summary', 'Primary space body', 'e2e-bulk-media-103', 'published', ${sql(now)}, ${sql(now)});
INSERT INTO spaces (id, locale, title, slug, category, summary, body, cover_media_id, status, created_at, updated_at)
VALUES ('e2e-alt-space-related', 'en', 'E2E assignment related space', 'e2e-alt-space-related', 'E2E Assignment Spaces', 'Related space summary', 'Related space body', 'e2e-bulk-media-102', 'published', ${sql(now)}, ${sql(now)});
INSERT INTO space_images (id, space_id, media_id, alt_text, sort_order, created_at)
VALUES ('e2e-alt-space-primary-cover', 'e2e-alt-space-primary', 'e2e-bulk-media-103', 'Primary space assignment alt', 0, ${sql(now)});
INSERT INTO space_images (id, space_id, media_id, alt_text, sort_order, created_at)
VALUES ('e2e-alt-space-related-cover', 'e2e-alt-space-related', 'e2e-bulk-media-102', 'Related space assignment alt', 0, ${sql(now)});`;
  const subscriberRows = [
    ["e2e-subscriber", "e2e-subscriber@example.test", "/__e2e__/footer", now],
    ["e2e-subscriber-formula", "=IMPORTXML(example)", "=HYPERLINK", "2099-01-01T00:00:01.000Z"],
    ...Array.from({ length: 49 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return [`e2e-subscriber-page-${suffix}`, `subscriber-${suffix}@example.test`, "/__e2e__/bulk", `2098-11-${String(30 - index % 30).padStart(2, "0")}T00:00:${String(index).padStart(2, "0")}.000Z`];
    }),
    ["e2e-subscriber-later", "late-subscriber@example.test", "/__e2e__/late", "2000-01-01T00:00:00.000Z"],
  ];
  const subscribers = subscriberRows.map(([id, email, source, timestamp]) => `INSERT INTO subscribers (id, email, source, status, subscribed_at, created_at, updated_at)
VALUES (${sql(id)}, ${sql(email)}, ${sql(source)}, 'subscribed', ${sql(timestamp)}, ${sql(timestamp)}, ${sql(timestamp)});`).join("\n");
  const settings = `INSERT INTO settings (id, company_name, tagline, company_description, contact_email, instagram_url, pinterest_url, linkedin_url, default_seo_title, default_seo_description, created_at, updated_at)
VALUES ('site', 'EVERSTEM', 'E2E original tagline', 'E2E company', 'e2e@example.test', NULL, NULL, NULL, 'EVERSTEM', 'E2E description', ${sql(now)}, ${sql(now)})
ON CONFLICT(id) DO UPDATE SET company_name = excluded.company_name, tagline = excluded.tagline, company_description = excluded.company_description,
contact_email = excluded.contact_email, updated_by_user_id = NULL, updated_at = excluded.updated_at;`;
  return `DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'e2e-%' OR slug LIKE 'picker-pagination-%');
DELETE FROM products WHERE slug LIKE 'e2e-%' OR slug LIKE 'picker-pagination-%';
DELETE FROM space_images WHERE space_id IN (SELECT id FROM spaces WHERE slug LIKE 'e2e-%');
DELETE FROM spaces WHERE slug LIKE 'e2e-%';
DELETE FROM articles WHERE slug LIKE 'e2e-%';
DELETE FROM pages WHERE page_key LIKE 'e2e-%';
DELETE FROM categories WHERE slug LIKE 'e2e-%';
DELETE FROM media WHERE id LIKE 'e2e-bulk-media-%';
DELETE FROM media WHERE id LIKE 'e2e-clamp-media-%';
DELETE FROM inquiry_interests WHERE inquiry_id LIKE 'e2e-dashboard-%';
DELETE FROM inquiry_notes WHERE inquiry_id LIKE 'e2e-dashboard-%';
DELETE FROM audit_logs WHERE entity_id LIKE 'e2e-dashboard-%' OR entity_id = 'e2e-managed' OR (entity_type = 'settings' AND entity_id = 'site');
DELETE FROM inquiries WHERE id LIKE 'e2e-dashboard-%';
DELETE FROM subscribers WHERE id LIKE 'e2e-subscriber%';
DELETE FROM sessions WHERE user_id IN ('e2e-admin', 'e2e-editor', 'e2e-sales', 'e2e-managed');
DELETE FROM rate_limits WHERE key = 'auth:login:unknown';
${users}
${inquiries}
${subscribers}
${settings}
${bulkCategories}
${bulkSpaces}
${bulkMedia}
${clampMedia}
${assignmentAltFixtures}`;
}

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
