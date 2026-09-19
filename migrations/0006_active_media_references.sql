CREATE TRIGGER categories_active_cover_insert
BEFORE INSERT ON categories
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER categories_active_cover_update
BEFORE UPDATE OF cover_media_id ON categories
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER products_active_cover_insert
BEFORE INSERT ON products
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER products_active_cover_update
BEFORE UPDATE OF cover_media_id ON products
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER spaces_active_cover_insert
BEFORE INSERT ON spaces
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER spaces_active_cover_update
BEFORE UPDATE OF cover_media_id ON spaces
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER articles_active_cover_insert
BEFORE INSERT ON articles
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER articles_active_cover_update
BEFORE UPDATE OF cover_media_id ON articles
WHEN NEW.cover_media_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.cover_media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER product_images_active_media_insert
BEFORE INSERT ON product_images
WHEN NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER product_images_active_media_update
BEFORE UPDATE OF media_id ON product_images
WHEN NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER space_images_active_media_insert
BEFORE INSERT ON space_images
WHEN NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;

CREATE TRIGGER space_images_active_media_update
BEFORE UPDATE OF media_id ON space_images
WHEN NOT EXISTS (SELECT 1 FROM media WHERE id = NEW.media_id AND is_deleted = 0)
BEGIN
  SELECT RAISE(ABORT, 'active media required');
END;
