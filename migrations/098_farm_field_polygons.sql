-- Migration 098: Create farm_field_polygons table
-- Stores field boundary polygons for Agromonitoring satellite imagery integration.
-- Each row maps a farmer's drawn field polygon to an Agromonitoring polygon ID.

CREATE TABLE IF NOT EXISTS farm_field_polygons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  polygon_name   TEXT NOT NULL,
  -- Agromonitoring-assigned polygon ID (set after successful API registration)
  agro_poly_id   TEXT UNIQUE,
  -- GeoJSON geometry (Polygon type, coordinates in [[lon,lat]] format)
  geojson        JSONB NOT NULL,
  crop_type      TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS farm_field_polygons_user_id_idx ON farm_field_polygons(user_id);
CREATE INDEX IF NOT EXISTS farm_field_polygons_tenant_id_idx ON farm_field_polygons(tenant_id);

COMMENT ON TABLE farm_field_polygons IS 'Farm field boundary polygons for Agromonitoring satellite data';
COMMENT ON COLUMN farm_field_polygons.agro_poly_id IS 'Polygon ID from Agromonitoring API — null until first registered';
COMMENT ON COLUMN farm_field_polygons.geojson IS 'GeoJSON Polygon geometry in lon/lat coordinates';
