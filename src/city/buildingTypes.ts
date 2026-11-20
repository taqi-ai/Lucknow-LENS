/**
 * buildingTypes — constants shared by the offline pipeline (scripts/build_buildings.ts,
 * scripts/bake_hlod.ts), the tile worker and the building shader. Changing a value here
 * changes the binary meaning of `aPack`, so bump BUILDING_FORMAT_VERSION with it.
 */

/** v2: aPack = hash | height(0.5 m) | AO<<4 | surface, typology<<5 | orient(32). */
export const BUILDING_FORMAT_VERSION = 2;

/** Lucknow architectural typologies (3 bits). */
export const TYPOLOGY = {
  GENERIC: 0,        // generic Lucknow residential / peripheral
  OLD_CITY: 1,       // dense old-city residential (Chowk, Nakhas, Hussainabad...)
  MARKET: 2,         // traditional market & commercial frontage
  HERITAGE: 3,       // heritage / colonial civic fabric
  APARTMENT: 4,      // modern apartment blocks
  INSTITUTIONAL: 5,  // institutional & government
  INDUSTRIAL: 6,     // industrial sheds & yards
  PLANNED: 7,        // planned residential colonies (Gomti Nagar, Indira Nagar...)
} as const;
export type Typology = typeof TYPOLOGY[keyof typeof TYPOLOGY];

/** Storey height per typology, metres. */
export const FLOOR_HEIGHT: Record<number, number> = {
  [TYPOLOGY.GENERIC]: 3.1,
  [TYPOLOGY.OLD_CITY]: 3.3,
  [TYPOLOGY.MARKET]: 3.6,
  [TYPOLOGY.HERITAGE]: 4.8,
  [TYPOLOGY.APARTMENT]: 3.0,
  [TYPOLOGY.INSTITUTIONAL]: 3.9,
  [TYPOLOGY.INDUSTRIAL]: 6.5,
  [TYPOLOGY.PLANNED]: 3.15,
};

/** Surface kinds (4 bits) — what a fragment is, so one material can shade everything. */
export const SURFACE = {
  WALL: 0,
  ROOF: 1,          // flat RCC terrace
  PARAPET: 2,
  STAIR: 3,         // stair cabin (mumty) / rooftop room walls
  TANK_BLACK: 4,    // black polyethylene water tank
  TANK_WHITE: 5,    // white/cream tank or masonry tank
  SOLAR: 6,
  METAL: 7,         // corrugated sheet roof / shelter / industrial roof
  SLAB: 8,          // chhajja, balcony slab, canopy
  EQUIP: 9,         // AC units, vents, rooftop equipment
  STONE: 10,        // landmark stone / lakhori brick + lime plaster
  DOME: 11,         // landmark domes and chhatris (lime-washed)
  GILT: 12,         // finials, clock faces
  GLASS: 13,        // curtain wall
  TRIM: 14,         // landmark trim, arches outlines
  REDSTONE: 15,     // red sandstone / Victorian red brick (Clock Tower, Residency, Ambedkar Memorial)
} as const;
