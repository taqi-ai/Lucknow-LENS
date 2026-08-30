/**
 * The one lat/lon <-> world-XZ projection for Lucknow LENS.
 *
 * CENTER_LAT/CENTER_LON is the actual centroid of the extracted Overture
 * dataset (see scripts/generate_overture_tiles.ts), not a rounded guess — the
 * tiles, HLOD bake, transportation extraction and vegetation placement all
 * derive their world coordinates from this exact origin. Any other module
 * that reprojects a raw lat/lon (search, camera flythrough targets, landmark
 * entry authoring) must use this same origin, or its output will sit tens to
 * hundreds of metres away from the geometry everything else agrees on.
 *
 * Equirectangular, not a true projection — adequate at city scale (~15 km
 * across), consistent with every consumer below.
 */

export const CENTER_LAT = 26.84997035;
export const CENTER_LON = 80.95005255000001;

export const M_PER_LAT = 111320;
export const M_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

export function project(lat: number, lon: number): { x: number; z: number } {
  return {
    x: (lon - CENTER_LON) * M_PER_LON,
    z: -(lat - CENTER_LAT) * M_PER_LAT,
  };
}

export function unproject(x: number, z: number): { lat: number; lon: number } {
  return {
    lat: CENTER_LAT - z / M_PER_LAT,
    lon: CENTER_LON + x / M_PER_LON,
  };
}
