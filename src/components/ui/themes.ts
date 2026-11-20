import type { SkylineStyle } from '../../city/buildingMaterial';

/** The style of the city. Time of day (day or night) is a separate switch. */
export type ThemeId = 'warm' | 'clear' | 'neon';

export interface MapTheme {
  id: ThemeId;
  name: string;
  day: string;
  night: string;
  style: SkylineStyle;
  /** Swatches for the picker: [day, night]. */
  swatch: [string, string];
}

export const THEMES: MapTheme[] = [
  { id: 'warm', name: 'Natural warm', day: 'Soft afternoon sun', night: 'Sodium-lit streets', style: 'warm',
    swatch: ['linear-gradient(135deg,#f6e4c4,#d9b88a 55%,#8fa88f)', 'linear-gradient(135deg,#2a2218,#151a22 60%,#e0a45b)'] },
  { id: 'clear', name: 'Clear', day: 'Neutral midday light', night: 'Cool moonlight', style: 'clear',
    swatch: ['linear-gradient(135deg,#eef3f8,#c9d6e2 55%,#8aa0b3)', 'linear-gradient(135deg,#1c2638,#0d1320 60%,#9fb6dd)'] },
  { id: 'neon', name: 'Neon', day: 'Cyan key, magenta shadows', night: 'Full cyberpunk', style: 'cyberpunk',
    swatch: ['linear-gradient(135deg,#3b2a6a,#1a2a5a 55%,#5fd0f5)', 'linear-gradient(135deg,#1a0a2a,#0a1a3a 55%,#00d2ff)'] },
];

export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
