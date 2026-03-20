-- Fix label_image_url values that are presigned S3 URLs (they expire after 7 days).
-- Convert them to permanent S3 URLs by stripping the query string.
-- The image proxy (/api/images/proxy) uses server-side AWS credentials so permanent
-- URLs work fine for private buckets.
--
-- Presigned URLs look like:
--   https://bucket.s3.region.amazonaws.com/key?X-Amz-Algorithm=...&X-Amz-Signature=...
-- Permanent URLs look like:
--   https://bucket.s3.region.amazonaws.com/key

UPDATE label_templates
SET label_image_url = SPLIT_PART(label_image_url, '?', 1),
    updated_at = NOW()
WHERE label_image_url LIKE '%amazonaws.com%'
  AND label_image_url LIKE '%?X-Amz-%';
