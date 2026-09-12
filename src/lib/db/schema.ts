import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contentStatuses = ["draft", "published", "archived"] as const;
export const inquiryStatuses = ["new", "contacted", "qualified", "closed", "spam"] as const;
export const inquiryTypes = ["product", "contact", "catalog"] as const;
export const userRoles = ["admin", "editor", "sales"] as const;

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

const localizedContent = {
  locale: text("locale").notNull(),
  translationGroupId: text("translation_group_id"),
  status: text("status", { enum: contentStatuses }).notNull(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ...timestamps,
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: userRoles }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: text("last_login_at"),
    ...timestamps,
  },
  (table) => [
    index("users_active_role_idx").on(table.isActive, table.role),
    check("users_role_check", sql`${table.role} in ('admin', 'editor', 'sales')`),
    check("users_active_check", sql`${table.isActive} in (0, 1)`),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenDigest: text("token_digest").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id),
    expiresAt: text("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("sessions_user_expiry_idx").on(table.userId, table.expiresAt)],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    deletedAt: text("deleted_at"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("media_deleted_created_idx").on(table.isDeleted, table.createdAt),
    check("media_byte_size_check", sql`${table.byteSize} >= 0`),
    check("media_deleted_check", sql`${table.isDeleted} in (0, 1)`),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    coverMediaId: text("cover_media_id").references(() => media.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localizedContent,
  },
  (table) => [
    uniqueIndex("categories_locale_slug_unique").on(table.locale, table.slug),
    index("categories_status_order_idx").on(table.status, table.sortOrder),
    check("categories_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    productCode: text("product_code").notNull().unique(),
    summary: text("summary"),
    body: text("body"),
    specificationsJson: text("specifications_json").notNull(),
    categoryId: text("category_id").notNull().references(() => categories.id),
    coverMediaId: text("cover_media_id").references(() => media.id),
    ...localizedContent,
  },
  (table) => [
    uniqueIndex("products_locale_slug_unique").on(table.locale, table.slug),
    index("products_status_category_idx").on(table.status, table.categoryId),
    index("products_status_updated_idx").on(table.status, table.updatedAt),
    check("products_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull().references(() => products.id),
    mediaId: text("media_id").notNull().references(() => media.id),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    isCover: integer("is_cover", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("product_images_product_media_unique").on(table.productId, table.mediaId),
    index("product_images_product_order_idx").on(table.productId, table.sortOrder),
    check("product_images_cover_check", sql`${table.isCover} in (0, 1)`),
  ],
);

export const spaces = sqliteTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull(),
    location: text("location"),
    summary: text("summary"),
    body: text("body"),
    coverMediaId: text("cover_media_id").references(() => media.id),
    ...localizedContent,
  },
  (table) => [
    uniqueIndex("spaces_locale_slug_unique").on(table.locale, table.slug),
    index("spaces_status_category_idx").on(table.status, table.category),
    index("spaces_status_updated_idx").on(table.status, table.updatedAt),
    check("spaces_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const spaceImages = sqliteTable(
  "space_images",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id").notNull().references(() => spaces.id),
    mediaId: text("media_id").notNull().references(() => media.id),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("space_images_space_media_unique").on(table.spaceId, table.mediaId),
    index("space_images_space_order_idx").on(table.spaceId, table.sortOrder),
  ],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    body: text("body"),
    author: text("author"),
    coverMediaId: text("cover_media_id").references(() => media.id),
    publishedAt: text("published_at"),
    ...localizedContent,
  },
  (table) => [
    uniqueIndex("articles_locale_slug_unique").on(table.locale, table.slug),
    index("articles_status_published_idx").on(table.status, table.publishedAt),
    check("articles_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    pageKey: text("page_key").notNull(),
    sectionsJson: text("sections_json").notNull(),
    ...localizedContent,
  },
  (table) => [
    uniqueIndex("pages_locale_key_unique").on(table.locale, table.pageKey),
    index("pages_status_updated_idx").on(table.status, table.updatedAt),
    check("pages_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
  ],
);

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    inquiryType: text("inquiry_type", { enum: inquiryTypes }).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    country: text("country"),
    buyerType: text("buyer_type"),
    message: text("message"),
    productId: text("product_id").references(() => products.id),
    sourceRoute: text("source_route"),
    assigneeUserId: text("assignee_user_id").references(() => users.id),
    status: text("status", { enum: inquiryStatuses }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("inquiries_status_created_idx").on(table.status, table.createdAt),
    index("inquiries_assignee_status_idx").on(table.assigneeUserId, table.status),
    index("inquiries_product_created_idx").on(table.productId, table.createdAt),
    check("inquiries_type_check", sql`${table.inquiryType} in ('product', 'contact', 'catalog')`),
    check("inquiries_status_check", sql`${table.status} in ('new', 'contacted', 'qualified', 'closed', 'spam')`),
  ],
);

export const inquiryInterests = sqliteTable(
  "inquiry_interests",
  {
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    interest: text("interest").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ name: "inquiry_interests_primary", columns: [table.inquiryId, table.interest] }),
    index("inquiry_interests_interest_idx").on(table.interest),
  ],
);

export const inquiryNotes = sqliteTable(
  "inquiry_notes",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    authorUserId: text("author_user_id").notNull().references(() => users.id),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("inquiry_notes_inquiry_created_idx").on(table.inquiryId, table.createdAt)],
);

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    source: text("source").notNull(),
    status: text("status", { enum: ["subscribed", "unsubscribed"] as const }).notNull(),
    subscribedAt: text("subscribed_at").notNull(),
    unsubscribedAt: text("unsubscribed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("subscribers_status_created_idx").on(table.status, table.createdAt),
    check("subscribers_status_check", sql`${table.status} in ('subscribed', 'unsubscribed')`),
  ],
);

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  tagline: text("tagline"),
  companyDescription: text("company_description"),
  contactEmail: text("contact_email"),
  instagramUrl: text("instagram_url"),
  pinterestUrl: text("pinterest_url"),
  linkedinUrl: text("linkedin_url"),
  defaultSeoTitle: text("default_seo_title"),
  defaultSeoDescription: text("default_seo_description"),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    contextText: text("context_text"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("audit_logs_entity_created_idx").on(table.entityType, table.entityId, table.createdAt)],
);
