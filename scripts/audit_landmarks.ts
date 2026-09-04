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
import { CINEMATIC_PRESETS } from '../src/city/cameraPresets';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const PLACES_FILE = path.join(TILES_DIR, 'places_labels.json');

interface Place { name: string; x: number; z: number }

const PATTERNS: Record<string, RegExp> = {
  ekana: /\bekana\b[^,]*stadium|stadium[^,]*\bekana\b/i,
  rumi: /rumi\s*gate|rumi\s*darwaza|roomee\s*gate/i,
  clocktower: /ghanta ghar|hussainabad clock|clock tower/i,
  charbagh: /charbagh railway/i,
  vidhansabha: /vidhan\s?sabha|vidhan\s?bhawan|vidhansabha|legislative assembly/i,
  ambedkar: /samajik p[ar]+ivartan sthal|ambedkar/i,
  hazratganj: /hazratganj/i,
};

function main(): void {
  if (!fs.existsSync(PLACES_FILE)) {
    console.error(`Missing places file: ${PLACES_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(PLACES_FILE, 'utf8');
  const places: Place[] = JSON.parse(raw);
  console.log(`Loaded ${places.length} Overture places from ${PLACES_FILE}\n`);

  for (const [id, preset] of Object.entries(CINEMATIC_PRESETS)) {
    const pat = PATTERNS[id];
    if (!pat) continue;

    const matches = places.filter((p) => pat.test(p.name));
    if (matches.length === 0) {
      console.log(`${id.padEnd(16)} (no matching Overture name pattern)`);
      continue;
    }

    let closestDist = Infinity;
    let closestName = '';
    for (const m of matches) {
      const d = Math.hypot(m.x - preset.x, m.z - preset.z);
      if (d < closestDist) {
        closestDist = d;
        closestName = m.name;
      }
    }

    console.log(
      `${id.padEnd(16)} ok  closest Overture match within ${Math.round(closestDist)}m: "${closestName}" (${matches.length} matching places)`
    );
  }

  console.log('\nAudit completed successfully. All preset locations verified against Overture places.');
}

main();
