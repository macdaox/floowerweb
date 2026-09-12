CREATE TABLE inquiry_interests (
  inquiry_id TEXT NOT NULL REFERENCES inquiries(id),
  interest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (inquiry_id, interest)
);
CREATE INDEX inquiry_interests_interest_idx ON inquiry_interests (interest);

INSERT OR IGNORE INTO inquiry_interests (inquiry_id, interest, created_at)
SELECT inquiries.id, json_each.value, inquiries.created_at
FROM inquiries, json_each(
  CASE WHEN json_valid(inquiries.interests_json) THEN inquiries.interests_json ELSE '[]' END
)
WHERE typeof(json_each.value) = 'text';

ALTER TABLE inquiries DROP COLUMN interests_json;

ALTER TABLE settings RENAME TO settings_legacy;
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
INSERT INTO settings (
  id, company_name, tagline, company_description, contact_email, instagram_url, pinterest_url, linkedin_url,
  default_seo_title, default_seo_description, updated_by_user_id, created_at, updated_at
)
SELECT
  key,
  COALESCE(json_extract(value_json, '$.companyName'), key),
  json_extract(value_json, '$.tagline'),
  COALESCE(json_extract(value_json, '$.companyDescription'), json_extract(value_json, '$.description')),
  json_extract(value_json, '$.contactEmail'),
  json_extract(value_json, '$.instagramUrl'),
  json_extract(value_json, '$.pinterestUrl'),
  json_extract(value_json, '$.linkedinUrl'),
  json_extract(value_json, '$.defaultSeoTitle'),
  json_extract(value_json, '$.defaultSeoDescription'),
  updated_by_user_id,
  created_at,
  updated_at
FROM settings_legacy;
DROP TABLE settings_legacy;

ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  context_text TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, context_text, created_at)
SELECT id, actor_user_id, action, entity_type, entity_id, context_json, created_at
FROM audit_logs_legacy;
DROP TABLE audit_logs_legacy;
CREATE INDEX audit_logs_entity_created_idx ON audit_logs (entity_type, entity_id, created_at);
