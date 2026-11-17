# Lucknow Lens brand guidelines

The name is **Lucknow Lens** in running text and **LUCKNOW LENS** in the wordmark. The config lives in `src/components/brand/brand.ts`. The only logo component is `src/components/brand/LucknowLensLogo.tsx`.

## Mark
The mark has three parts: an outlined L-frame, a lens disc with six aperture blades, and a simplified Rumi Darwaza gateway inside the lens. Everything is vector and monochrome. To regenerate the files, run `npx tsx scripts/build_brand.ts`.

| Variant | File / usage |
|---|---|
| Horizontal | `public/brand/lucknow-lens-logo.svg`, or `<LucknowLensLogo variant="horizontal" />` |
| Stacked | `<LucknowLensLogo variant="stacked" />` |
| Icon only | `public/brand/lucknow-lens-mark.svg`, or `<LucknowLensMark />` |
| Dark / light | `lucknow-lens-logo-dark.svg` (ivory on dark) and `lucknow-lens-logo-light.svg` (charcoal on light), or the `tone` prop |
| Favicon / PWA | `favicon.svg`, plus PNGs at 32, 180, 192 and 512 px, in `manifest.webmanifest` |
| Social | `lucknow-lens-og.png` |

## Colours
Charcoal `#16130f`, ivory `#f3ead8`, gold accent `#c9a35b`, sandstone `#b98a64`, grey `#8d877c`. The logo itself uses only charcoal and ivory. Gold is for UI accents.

## Typography
The wordmark is set in Montserrat 500 with wide tracking (letter-spacing about 0.23 em). UI text uses the app's existing type stack.

## Clear space, size and backgrounds
- Keep clear space of at least the lens radius (about a quarter of the mark's height) on every side.
- Minimum size: 16 px for the mark (favicon) and 120 px wide for the horizontal lockup.
- Use the ivory logo on dark or photographic backgrounds and the charcoal logo on light ones.
- Never recolour, stretch, rotate, add shadows, or put the logo on busy imagery without a solid plate.

## Legacy
The visible "Terralyt" branding has been removed. Internal ids, `terralyt.*` storage keys and deployment URLs (terralyt-six, terralyt-data) are intentionally unchanged so saved settings and hosting keep working. The original logo reference image is kept.
