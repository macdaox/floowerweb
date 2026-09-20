CREATE TRIGGER pages_active_media_insert
BEFORE INSERT ON pages
WHEN EXISTS (
  SELECT 1
  FROM json_tree(NEW.sections_json) AS node
  WHERE node.key = 'src'
    AND node.value LIKE '/media/%'
    AND NOT EXISTS (
      SELECT 1 FROM media
      WHERE is_deleted = 0 AND '/media/' || object_key = node.value
    )
)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER pages_active_media_update
BEFORE UPDATE OF sections_json ON pages
WHEN EXISTS (
  SELECT 1
  FROM json_tree(NEW.sections_json) AS node
  WHERE node.key = 'src'
    AND node.value LIKE '/media/%'
    AND NOT EXISTS (
      SELECT 1 FROM media
      WHERE is_deleted = 0 AND '/media/' || object_key = node.value
    )
)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER media_page_reference_delete
BEFORE UPDATE OF is_deleted ON media
WHEN NEW.is_deleted = 1
  AND OLD.is_deleted = 0
  AND EXISTS (
    SELECT 1
    FROM pages, json_tree(pages.sections_json) AS node
    WHERE node.key = 'src' AND node.value = '/media/' || OLD.object_key
  )
BEGIN
  SELECT RAISE(ABORT, 'media is referenced');
END;
