/**
 * audit_landmarks.ts — catches landmarks placed on the wrong place record.
 *
 * Overture frequently holds several records for one real POI, and they do not
 * always agree: KD Singh Babu Stadium has five records, four clustered on the
 * real stadium and one 1.6 km west; the Legislative Assembly has five, four
 * around Vidhan Bhawan and one 3.5 km south. Picking a record by name alone is
 * a coin flip, and picking the wrong one puts a stadium in the wrong
 * neighbourhood while its labels stay in the right one — which is exactly what
 * "two KD Singh stadiums" looks like on screen.
 *
 * So the rule is consensus, not first match: cluster every record whose name
 * matches, and expect the landmark to sit on the LARGEST cluster. A landmark
 * sitting on a minority cluster is reported.
 *
 * This is a check, not a fixer. It prints what disagrees and what the consensus
 * position is; correcting the registry stays a human decision, because a
 * minority cluster is occasionally the right one.
 *
 * Usage: npm run audit:landmarks
 */

import fs from 'fs';
import path from 'path';
import { LANDMARKS } from '../src/city/landmarkRegistry';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');

/** Single-link clustering distance, metres. */
const CLUSTER_RADIUS = 400;
/** Report when the landmark is further than this from the consensus. */
const TOLERANCE = 350;

interface Place { name: string; x: number; z: number }

/**
 * Name patterns per landmark. Matching on the landmark's own display name is
 * not enough — "Bara Imambara" has no record under that spelling — so each
 * entry carries the aliases Overture actually uses.
 */
const PATTERNS: Record<string, RegExp> = {
  // Word boundary matters: /ekana/ also matches "Vivekanand".
  // Two traps here. /ekana/ alone matches "Vivekanand", and even with a word
  // boundary the largest cluster is "Innings By Ekana" — a namesake restaurant.
  // The pattern has to name the stadium, or consensus elects the wrong POI.
  ekana: /\bekana\b[^,]*stadium|stadium[^,]*\bekana\b/i,
  kdsingh: /k\.?\s?d\.?\s?singh/i,
  'chowk-stadium': /chowk stadium/i,
  'clock-tower': /ghanta ghar|hussainabad clock|clock tower/i,
  charbagh: /charbagh railway/i,
  'vidhan-sabha': /vidhan\s?sabha|vidhan\s?bhawan|vidhansabha|legislative assembly/i,
  'ambedkar-memorial': /ambedkar memorial/i,
  airport: /chaudhary charan singh international/i,
  'phoenix-palassio': /phoenix palassio/i,
  'lucknow-university': /lucknow university/i,
  sgpgi: /sgpgi/i,
  'janeshwar-flag': /janeshwar mishra park/i,
};

function main(): void {
  const raw = JSON.parse(
    fs.readFileSync(path.join(TILES_DIR, 'places_labels.json'), 'utf8'),
  );
  const list: any[] = Array.isArray(raw) ? raw : (raw.places ?? []);
  const places: Place[] = list
    .filter((p) => p?.name)
    .map((p) => ({
      name: p.name as string,
      x: p.position ? p.position.x : p.x,
      z: p.position ? p.position.z : p.z,
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));

  let problems = 0;
  let unverifiable = 0;

  for (const lm of LANDMARKS) {
    const re = PATTERNS[lm.id];
    if (!re) {
      unverifiable++;
      console.log(`${lm.id.padEnd(20)} no pattern — not verifiable against place data`);
      continue;
    }
    const hits = places.filter((p) => re.test(p.name));
    if (hits.length === 0) {
      unverifiable++;
      console.log(`${lm.id.padEnd(20)} NO RECORDS — position is curated, cannot verify`);
      continue;
    }

    // Single-link clustering.
    const clusters: Place[][] = [];
    for (const h of hits) {
      const found = clusters.find((c) =>
        c.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < CLUSTER_RADIUS));
      if (found) found.push(h);
      else clusters.push([h]);
    }
    clusters.sort((a, b) => b.length - a.length);

    const big = clusters[0];
    const cx = big.reduce((s, p) => s + p.x, 0) / big.length;
    const cz = big.reduce((s, p) => s + p.z, 0) / big.length;
    const off = Math.hypot(lm.x - cx, lm.z - cz);

    if (off > TOLERANCE) {
      problems++;
      console.log(
        `${lm.id.padEnd(20)} OFF by ${Math.round(off)}m — ` +
        `consensus x=${cx.toFixed(0)} z=${cz.toFixed(0)} ` +
        `(${big.length}/${hits.length} records, ${clusters.length} clusters)`,
      );
      for (const c of clusters.slice(0, 3)) {
        const ax = c.reduce((s, p) => s + p.x, 0) / c.length;
        const az = c.reduce((s, p) => s + p.z, 0) / c.length;
        console.log(`${''.padEnd(22)}n=${String(c.length).padStart(2)} ` +
                    `x=${ax.toFixed(0).padStart(7)} z=${az.toFixed(0).padStart(7)}  ${c[0].name.slice(0, 40)}`);
      }
    } else {
      console.log(`${lm.id.padEnd(20)} ok  ${Math.round(off)}m from consensus ` +
                  `(${big.length}/${hits.length} records)`);
    }
  }

  console.log(`\n${problems} landmark(s) on a minority cluster, ` +
              `${unverifiable} not verifiable against place data.`);
  if (problems > 0) process.exitCode = 1;
}

main();
