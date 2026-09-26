CREATE TRIGGER products_active_body_media_insert
BEFORE INSERT ON products
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER products_active_body_media_update
BEFORE UPDATE OF body ON products
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER spaces_active_body_media_insert
BEFORE INSERT ON spaces
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER spaces_active_body_media_update
BEFORE UPDATE OF body ON spaces
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER articles_active_body_media_insert
BEFORE INSERT ON articles
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER articles_active_body_media_update
BEFORE UPDATE OF body ON articles
WHEN EXISTS (SELECT 1 FROM media WHERE is_deleted = 1 AND instr(COALESCE(NEW.body, ''), '/media/' || object_key) > 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER pages_active_html_media_insert
BEFORE INSERT ON pages
WHEN EXISTS (
  SELECT 1 FROM json_tree(NEW.sections_json) AS node, media
  WHERE node.key = 'html' AND media.is_deleted = 1
    AND instr(CAST(node.value AS TEXT), '/media/' || media.object_key) > 0
)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER pages_active_html_media_update
BEFORE UPDATE OF sections_json ON pages
WHEN EXISTS (
  SELECT 1 FROM json_tree(NEW.sections_json) AS node, media
  WHERE node.key = 'html' AND media.is_deleted = 1
    AND instr(CAST(node.value AS TEXT), '/media/' || media.object_key) > 0
)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER media_rich_text_reference_delete
BEFORE UPDATE OF is_deleted ON media
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0 AND (
  EXISTS (SELECT 1 FROM products WHERE instr(COALESCE(body, ''), '/media/' || OLD.object_key) > 0)
  OR EXISTS (SELECT 1 FROM spaces WHERE instr(COALESCE(body, ''), '/media/' || OLD.object_key) > 0)
  OR EXISTS (SELECT 1 FROM articles WHERE instr(COALESCE(body, ''), '/media/' || OLD.object_key) > 0)
  OR EXISTS (
    SELECT 1 FROM pages, json_tree(pages.sections_json) AS node
    WHERE node.key = 'html' AND instr(CAST(node.value AS TEXT), '/media/' || OLD.object_key) > 0
  )
)
BEGIN
  SELECT RAISE(ABORT, 'media is referenced');
END;
