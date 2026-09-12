type SeedStatement = {
  sql: string;
  values: unknown[];
};

const seededAt = "2026-09-13T00:00:00.000Z";

const media = [
  ["media-magnolia", "demo/everstem-magnolia-v2.jpg", "everstem-magnolia-v2.jpg", "Artificial magnolia flowers arranged in a stone vessel"],
  ["media-branches", "demo/collection-branches.png", "collection-branches.png", "Delicate flowering branch displayed as an architectural object"],
  ["media-plants", "demo/collection-flowers.png", "collection-flowers.png", "Artificial plant composition with textile flowers and leaves"],
  ["media-trees", "demo/hero-tree.png", "hero-tree.png", "Large artificial tree in a contemporary interior"],
  ["media-installation", "demo/spaces-residential.png", "spaces-residential.png", "Botanical installation shaping a contemporary commercial interior"],
  ["media-hospitality", "demo/trade-installation.png", "trade-installation.png", "Artificial flower and branch installation in a refined hospitality interior"],
  ["media-hero", "demo/everstem-hero-magnolia-v3.png", "everstem-hero-magnolia-v3.png", "Sculptural artificial magnolia arrangement in a refined commercial lobby"],
  ["media-journal-space", "demo/journal-imperfection.png", "journal-imperfection.png", "Sculptural branch on a raw limestone pedestal"],
  ["media-journal-display", "demo/everstem-journal-v2.jpg", "everstem-journal-v2.jpg", "Artificial flowering branch arranged with stone and linen"],
  ["media-journal-material", "demo/detail-macro.png", "detail-macro.png", "Leaf, stone and textile material study"],
] as const;

/** Inserts the demo-derived English records. Stable IDs and conflict updates make re-seeding safe. */
export async function seedDemoContent(db: D1Database): Promise<void> {
  const statements: SeedStatement[] = [];

  for (const [id, objectKey, filename, altText] of media) {
    statements.push({
      sql: `INSERT INTO media (id, object_key, original_filename, mime_type, byte_size, alt_text, is_deleted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(object_key) DO UPDATE SET original_filename = excluded.original_filename, mime_type = excluded.mime_type,
              alt_text = excluded.alt_text, is_deleted = 0, deleted_at = NULL, updated_at = excluded.updated_at`,
      values: [id, objectKey, filename, mimeType(filename), 0, altText, seededAt, seededAt],
    });
  }

  for (const category of categories) {
    statements.push({
      sql: `INSERT INTO categories (id, locale, name, slug, description, cover_media_id, sort_order, seo_title, seo_description, status, created_at, updated_at)
            VALUES (?, 'en', ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
            ON CONFLICT(locale, slug) DO UPDATE SET name = excluded.name, description = excluded.description,
              cover_media_id = excluded.cover_media_id, sort_order = excluded.sort_order, seo_title = excluded.seo_title,
              seo_description = excluded.seo_description, status = 'published', updated_at = excluded.updated_at`,
      values: [...category, seededAt, seededAt],
    });
  }

  for (const product of products) {
    statements.push({
      sql: `INSERT INTO products (id, locale, name, slug, product_code, summary, body, specifications_json, category_id, cover_media_id, seo_title, seo_description, status, created_at, updated_at)
            VALUES (?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
            ON CONFLICT(locale, slug) DO UPDATE SET name = excluded.name, product_code = excluded.product_code,
              summary = excluded.summary, body = excluded.body, specifications_json = excluded.specifications_json,
              category_id = excluded.category_id, cover_media_id = excluded.cover_media_id, seo_title = excluded.seo_title,
              seo_description = excluded.seo_description, status = 'published', updated_at = excluded.updated_at`,
      values: [...product, seededAt, seededAt],
    });
  }

  for (const space of spaces) {
    statements.push({
      sql: `INSERT INTO spaces (id, locale, title, slug, category, location, summary, body, cover_media_id, seo_title, seo_description, status, created_at, updated_at)
            VALUES (?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
            ON CONFLICT(locale, slug) DO UPDATE SET title = excluded.title, category = excluded.category, location = excluded.location,
              summary = excluded.summary, body = excluded.body, cover_media_id = excluded.cover_media_id, seo_title = excluded.seo_title,
              seo_description = excluded.seo_description, status = 'published', updated_at = excluded.updated_at`,
      values: [...space, seededAt, seededAt],
    });
  }

  for (const article of articles) {
    statements.push({
      sql: `INSERT INTO articles (id, locale, title, slug, summary, body, author, cover_media_id, published_at, seo_title, seo_description, status, created_at, updated_at)
            VALUES (?, 'en', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
            ON CONFLICT(locale, slug) DO UPDATE SET title = excluded.title, summary = excluded.summary, body = excluded.body,
              author = excluded.author, cover_media_id = excluded.cover_media_id, published_at = excluded.published_at,
              seo_title = excluded.seo_title, seo_description = excluded.seo_description, status = 'published', updated_at = excluded.updated_at`,
      values: [...article, seededAt, seededAt],
    });
  }

  for (const page of pages) {
    statements.push({
      sql: `INSERT INTO pages (id, page_key, locale, sections_json, seo_title, seo_description, status, created_at, updated_at)
            VALUES (?, ?, 'en', ?, ?, ?, 'published', ?, ?)
            ON CONFLICT(locale, page_key) DO UPDATE SET sections_json = excluded.sections_json, seo_title = excluded.seo_title,
              seo_description = excluded.seo_description, status = 'published', updated_at = excluded.updated_at`,
      values: [...page, seededAt, seededAt],
    });
  }

  statements.push({
    sql: `INSERT INTO settings (key, value_json, created_at, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    values: [
      "site",
      JSON.stringify({
        companyName: "EVERSTEM",
        tagline: "Botanical objects for contemporary spaces.",
        description: "EVERSTEM supplies artificial flowers, plants and trees for wholesale buyers, private label collections and commercial projects worldwide.",
        socialLinks: ["Instagram", "Pinterest", "LinkedIn"],
      }),
      seededAt,
      seededAt,
    ],
  });

  for (const statement of statements) {
    await db.prepare(statement.sql).bind(...statement.values).run();
  }
}

const categories = [
  ["category-flowers", "Artificial flowers", "artificial-flowers", "Single stems and arrangements with natural rhythm.", "media-magnolia", 10, "Artificial flowers | EVERSTEM", "Artificial flowers for wholesale buyers."],
  ["category-branches", "Artificial branches", "artificial-branches", "Flowering and foliage branches composed as architectural objects.", "media-branches", 20, "Artificial branches | EVERSTEM", "Flowering and foliage branches for long-term displays."],
  ["category-plants", "Artificial plants", "artificial-plants", "Potted botanical forms for contemporary interiors.", "media-plants", 30, "Artificial plants | EVERSTEM", "Potted botanical forms for wholesale collections."],
  ["category-trees", "Artificial trees", "artificial-trees", "Floor-standing statement trees for permanent installations.", "media-trees", 40, "Artificial trees | EVERSTEM", "Floor-standing artificial trees for commercial spaces."],
  ["category-installations", "Botanical installations", "botanical-installations", "Custom commercial displays shaped by architecture, light and movement.", "media-installation", 50, "Botanical installations | EVERSTEM", "Custom botanical installations for commercial interiors."],
] as const;

const products = [
  ["product-magnolia", "Magnolia stem", "magnolia-stem", "ES-MAG-001", "A sculptural artificial magnolia stem with layered textile petals.", "Textile petals, molded leaf veins and a wired stem create an arrangement with quiet presence.", JSON.stringify({ material: "Textile and molded resin", stem: "Wired", use: "Single stem or arrangement" }), "category-flowers", "media-magnolia", "Magnolia stem | EVERSTEM", "Artificial magnolia stem for wholesale and display projects."],
  ["product-flowering-branch", "Flowering branch", "flowering-branch", "ES-BRA-001", "A delicate flowering branch with a naturally irregular silhouette.", "Designed to bring vertical rhythm and botanical scale to long-term displays.", JSON.stringify({ material: "Textile and resin", stem: "Wired branch", use: "Architectural arrangement" }), "category-branches", "media-branches", "Flowering branch | EVERSTEM", "Artificial flowering branch for architectural displays."],
  ["product-potted-botanical", "Potted botanical composition", "potted-botanical-composition", "ES-PLT-001", "A textile-flower and foliage composition for indoor display.", "Layered materials and restrained tonal variation give the form depth from every angle.", JSON.stringify({ material: "Textile and molded foliage", use: "Potted display", finish: "Hand-toned" }), "category-plants", "media-plants", "Potted botanical composition | EVERSTEM", "Artificial plant composition for refined interiors."],
  ["product-statement-tree", "Statement tree", "statement-tree", "ES-TRE-001", "A floor-standing artificial tree for contemporary commercial interiors.", "The tree is composed for permanence, visual scale and controlled styling.", JSON.stringify({ material: "Molded foliage and natural-look trunk", use: "Floor-standing", finish: "Commercial grade" }), "category-trees", "media-trees", "Statement tree | EVERSTEM", "Artificial statement tree for commercial interiors."],
  ["product-hospitality-installation", "Hospitality botanical installation", "hospitality-botanical-installation", "ES-INS-001", "A custom installation of artificial flowers and branches for hospitality spaces.", "Developed around architecture, light and movement for an immersive branded environment.", JSON.stringify({ service: "Custom installation", use: "Hospitality and retail", supply: "Global project supply" }), "category-installations", "media-hospitality", "Hospitality botanical installation | EVERSTEM", "Custom artificial botanical installation for hospitality interiors."],
] as const;

const spaces = [
  ["space-hospitality", "Hospitality botanicals in context", "hospitality-botanicals", "Hospitality", "Commercial interior", "Botanical scale composed with architecture, light and movement.", "A custom artificial flower and branch installation developed for a refined hospitality environment.", "media-hospitality", "Hospitality botanical installation | EVERSTEM", "A case study in artificial botanical scale for commercial interiors."],
] as const;

const articles = [
  ["article-commercial-space", "How artificial botanicals shape commercial space", "how-artificial-botanicals-shape-commercial-space", "A look at botanical scale, permanence and atmosphere in commercial interiors.", "Artificial botanicals can establish rhythm, soften material palettes and create an experience that remains considered through every season.", "EVERSTEM", "media-journal-space", "2026-09-01T00:00:00.000Z", "How artificial botanicals shape commercial space | EVERSTEM", "How artificial botanicals support commercial interiors."],
  ["article-long-term-displays", "Choosing flowers for long-term displays", "choosing-flowers-for-long-term-displays", "Consider proportion, material depth and maintenance when selecting a permanent botanical display.", "Long-term displays succeed when their forms have the same considered structure as the spaces around them.", "EVERSTEM", "media-journal-display", "2026-09-03T00:00:00.000Z", "Choosing flowers for long-term displays | EVERSTEM", "A guide to choosing artificial flowers for lasting displays."],
  ["article-material-development", "Material and color development", "material-and-color-development", "The small decisions behind petals, leaf veins and controlled tonal variation.", "Material development begins with botanical references and ends with a finish that feels at home in contemporary space.", "EVERSTEM", "media-journal-material", "2026-09-05T00:00:00.000Z", "Material and color development | EVERSTEM", "Notes on artificial botanical material and color development."],
] as const;

const pages = [
  ["page-home", "home", JSON.stringify([{ type: "hero", eyebrow: "Artificial Flowers & Plants for Wholesale", title: "Nature, reimagined.", image: "media-hero" }]), "EVERSTEM | Artificial Flowers and Botanical Objects", "Artificial flowers, plants and trees for wholesale buyers worldwide."],
  ["page-about", "about", JSON.stringify([{ type: "story", title: "Crafted in China. Designed for the world.", body: "From concept and sampling to production and packaging, EVERSTEM supports global buyers." }]), "About EVERSTEM", "Our approach to wholesale artificial botanicals."],
  ["page-contact", "contact", JSON.stringify([{ type: "contact", title: "Partner with EVERSTEM.", body: "Tell us what you are sourcing." }]), "Contact EVERSTEM", "Contact EVERSTEM for wholesale artificial botanicals."],
  ["page-wholesale", "wholesale", JSON.stringify([{ type: "services", title: "For trade", items: ["Wholesale collections", "Private label", "Sampling & development", "Export & project supply"] }]), "Wholesale artificial botanicals | EVERSTEM", "Wholesale collections, private label and project supply."],
  ["page-privacy", "privacy", JSON.stringify([{ type: "legal", title: "Privacy" }]), "Privacy | EVERSTEM", "EVERSTEM privacy information."],
  ["page-terms", "terms", JSON.stringify([{ type: "legal", title: "Terms" }]), "Terms | EVERSTEM", "EVERSTEM terms."],
] as const;

function mimeType(filename: string): string {
  return filename.endsWith(".png") ? "image/png" : "image/jpeg";
}
