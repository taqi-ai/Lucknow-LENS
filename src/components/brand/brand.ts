/**
 * Canonical Lucknow Lens brand configuration and vector artwork. Every logo in the app and in
 * public/brand/ is generated from the paths below (scripts/build_brand.mjs writes the SVG/PNG files).
 *
 * The mark: an outlined L-frame; a lens disc overlapping its foot, with six aperture blades and a
 * simplified Rumi Darwaza gateway (pointed arch, parapet, central chhatri, two minarets) inside.
 */
export const BRAND = {
  name: 'Lucknow Lens',
  nameUpper: 'LUCKNOW LENS',
  tagline: 'Lucknow, seen in 3D',
  colors: { charcoal: '#16130f', ivory: '#f3ead8', gold: '#c9a35b', sandstone: '#b98a64', grey: '#8d877c' },
} as const;

/** viewBox 0 0 100 100. `ink` draws the frame and disc; `cut` draws blades and the gateway. */
export function markSvgBody(ink: string, cut: string): string {
  const blades = [0, 60, 120, 180, 240, 300].map((a) => {
    const r = (d: number) => (d * Math.PI) / 180;
    const x1 = 58 + Math.cos(r(a)) * 21, y1 = 63 + Math.sin(r(a)) * 21;
    const x2 = 58 + Math.cos(r(a + 100)) * 9, y2 = 63 + Math.sin(r(a + 100)) * 9;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${cut}" stroke-width="2.4" stroke-linecap="round"/>`;
  }).join('');
  return `
  <path d="M18 6 H36 V40 M18 6 V88 Q18 94 24 94 H88 V76 H82" fill="none" stroke="${ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="58" cy="63" r="26" fill="${ink}"/>
  <circle cx="58" cy="63" r="22.5" fill="none" stroke="${cut}" stroke-width="1.6"/>
  ${blades}
  <g fill="${cut}">
    <path d="M47 81 V66 H50 V62 Q58 52 66 62 V66 H69 V81 Z"/>
    <rect x="42.6" y="62" width="2.6" height="19"/><circle cx="43.9" cy="61" r="1.8"/>
    <rect x="70.8" y="62" width="2.6" height="19"/><circle cx="72.1" cy="61" r="1.8"/>
    <rect x="55.4" y="50" width="5.2" height="4"/><path d="M54.6 50 Q58 45 61.4 50 Z"/>
  </g>
  <path d="M53.5 81 V70 Q58 63.5 62.5 70 V81 Z" fill="${ink}"/>`;
}

export function markSvg(ink: string, cut: string, bg?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg ? `<rect width="100" height="100" rx="22" fill="${bg}"/>` : ''}${markSvgBody(ink, cut)}</svg>`;
}

/** Horizontal lockup: mark + spaced wordmark. viewBox 0 0 420 100. */
export function logoSvg(ink: string, cut: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100"><g>${markSvgBody(ink, cut)}</g>
  <text x="112" y="62" fill="${ink}" font-family="Montserrat, 'Hanken Grotesk', 'Segoe UI', sans-serif" font-size="30" font-weight="500" letter-spacing="7">LUCKNOW LENS</text></svg>`;
}
