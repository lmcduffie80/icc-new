-- Add product image URLs to competitor_products so the PDP and admin
-- listings can render Amazon-style thumbnails next to each competitor row.
--
-- Image URLs come straight from the competitor product page (extracted by
-- the Claude web-search agent in lib/competitor-pricing.ts) and are stored
-- as plain text. Rendering uses a regular <img loading="lazy"> tag rather
-- than next/image because competitor hostnames are not known in advance —
-- adding wildcard remote patterns to next.config.ts would defeat the
-- domain allowlisting that Image Optimization relies on for safety.

ALTER TABLE competitor_products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN competitor_products.image_url
  IS 'Direct URL to the product image on the competitor''s site. NULL when the agent could not find a usable image.';
