import type { SkylineStyle } from '../../city/buildingMaterial';

export type ThemeId = 'warm' | 'clear' | 'night' | 'neon';

export interface MapTheme {
  id: ThemeId;
  name: string;
  note: string;
  night: boolean;
  style: SkylineStyle;
  /** CSS gradient used for the swatch in the picker. */
  swatch: string;
}

/** The look of the city. Natural warm is the default. */
export const THEMES: MapTheme[] = [
  { id: 'warm', name: 'Natural warm', note: 'Soft afternoon sun. The default.', night: false, style: 'warm', swatch: 'linear-gradient(135deg,#f6e4c4,#d9b88a 55%,#8fa88f)' },
  { id: 'clear', name: 'Clear day', note: 'Neutral midday light.', night: false, style: 'clear', swatch: 'linear-gradient(135deg,#eef3f8,#c9d6e2 55%,#8aa0b3)' },
  { id: 'night', name: 'Night', note: 'Dark city with street lights.', night: true, style: 'warm', swatch: 'linear-gradient(135deg,#1b2a3d,#0e1724 55%,#e0a45b)' },
  { id: 'neon', name: 'Neon', note: 'High-contrast cyber look.', night: true, style: 'cyberpunk', swatch: 'linear-gradient(135deg,#1a0a2a,#0a1a3a 55%,#00d2ff)' },
];

export const themeOf = (night: boolean, style: SkylineStyle): ThemeId =>
  THEMES.find((t) => t.night === night && t.style === style)?.id ?? 'warm';
