PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'sales')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX users_active_role_idx ON users (is_active, role);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_digest TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user_expiry_idx ON sessions (user_id, expires_at);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  deleted_at TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX media_deleted_created_idx ON media (is_deleted, created_at);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  translation_group_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  cover_media_id TEXT REFERENCES media(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (locale, slug)
);
CREATE INDEX categories_status_order_idx ON categories (status, sort_order);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  translation_group_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  product_code TEXT NOT NULL UNIQUE,
  summary TEXT,
  body TEXT,
  specifications_json TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  cover_media_id TEXT REFERENCES media(id),
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (locale, slug)
);
CREATE INDEX products_status_category_idx ON products (status, category_id);
CREATE INDEX products_status_updated_idx ON products (status, updated_at);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (product_id, media_id)
);
CREATE INDEX product_images_product_order_idx ON product_images (product_id, sort_order);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  translation_group_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT,
  summary TEXT,
  body TEXT,
  cover_media_id TEXT REFERENCES media(id),
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (locale, slug)
);
CREATE INDEX spaces_status_category_idx ON spaces (status, category);
CREATE INDEX spaces_status_updated_idx ON spaces (status, updated_at);

CREATE TABLE space_images (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (space_id, media_id)
);
CREATE INDEX space_images_space_order_idx ON space_images (space_id, sort_order);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  locale TEXT NOT NULL,
  translation_group_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  author TEXT,
  cover_media_id TEXT REFERENCES media(id),
  published_at TEXT,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (locale, slug)
);
CREATE INDEX articles_status_published_idx ON articles (status, published_at);

CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  page_key TEXT NOT NULL,
  locale TEXT NOT NULL,
  translation_group_id TEXT,
  sections_json TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (locale, page_key)
);
CREATE INDEX pages_status_updated_idx ON pages (status, updated_at);

CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('product', 'contact', 'catalog')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  country TEXT,
  buyer_type TEXT,
  message TEXT,
  product_id TEXT REFERENCES products(id),
  source_route TEXT,
  assignee_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX inquiries_status_created_idx ON inquiries (status, created_at);
CREATE INDEX inquiries_assignee_status_idx ON inquiries (assignee_user_id, status);
CREATE INDEX inquiries_product_created_idx ON inquiries (product_id, created_at);

CREATE TABLE inquiry_interests (
  inquiry_id TEXT NOT NULL REFERENCES inquiries(id),
  interest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (inquiry_id, interest)
);
CREATE INDEX inquiry_interests_interest_idx ON inquiry_interests (interest);

CREATE TABLE inquiry_notes (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES inquiries(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX inquiry_notes_inquiry_created_idx ON inquiry_notes (inquiry_id, created_at);

CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('subscribed', 'unsubscribed')),
  subscribed_at TEXT NOT NULL,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX subscribers_status_created_idx ON subscribers (status, created_at);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  tagline TEXT,
  company_description TEXT,
  contact_email TEXT,
  instagram_url TEXT,
  pinterest_url TEXT,
  linkedin_url TEXT,
  default_seo_title TEXT,
  default_seo_description TEXT,
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  context_text TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_entity_created_idx ON audit_logs (entity_type, entity_id, created_at);
