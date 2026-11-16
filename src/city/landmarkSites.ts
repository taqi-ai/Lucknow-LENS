/**
 * landmarkSites — footprints that are replaced by bespoke landmark models
 * (src/city/landmarks.ts). Generated from public/landmarks/footprints.json
 * (Overture 2026-10-21.0 footprints, matched by name / place consensus; see
 * docs/3d-revamp/LOCAL_IMPLEMENTATION_REPORT.md). Shared by the tile worker and the
 * HLOD baker so every LOD drops exactly the same footprints.
 */

export interface LandmarkSite {
  key: string;
  /** Overture GERS id of the anchoring footprint. */
  id: string;
  c: [number, number];
  /** Longest-edge angle of the footprint, radians (atan2(dz, dx)). */
  a: number;
  ext: [number, number];
  ring: Array<[number, number]>;
}

export const LANDMARK_SITES: LandmarkSite[] = [{"key":"bara_imambara","id":"d932d835-31fb-488c-83d2-ac90f14d5d7b","c":[-3710.7,-2078.3],"a":0.3152,"ext":[109.4,120.9],"ring":[[-3730.4,-2135.1],[-3738.7,-2133.9],[-3767.3,-2044.8],[-3673.3,-2014.2],[-3657.9,-2062.7],[-3662.5,-2065.5],[-3745,-2092.2],[-3730.4,-2135.1]]},{"key":"rumi_darwaza","id":"db8ea74a-0cb3-4073-bf44-7613fdf852f6","c":[-3760.5,-2364.9],"a":-1.2678,"ext":[33.4,74.8],"ring":[[-3758.2,-2377.6],[-3762.3,-2378.7],[-3770.1,-2354.1],[-3765.8,-2352.8],[-3772.1,-2333],[-3773.2,-2333.3],[-3775,-2332.5],[-3775.6,-2329.7],[-3774.4,-2328.1],[-3772.5,-2327.8],[-3770.6,-2328.9],[-3766.7,-2327.7],[-3763.4,-2338.1],[-3759.2,-2336.8],[-3742.2,-2391.1],[-3746.2,-2392.3],[-3744.4,-2398.2],[-3747.8,-2399.3],[-3748.7,-2401.9],[-3750.9,-2402.5],[-3753.1,-2401.1],[-3753.9,-2398.7],[-3753,-2397],[-3751.8,-2396.3],[-3758.2,-2377.6]]},{"key":"clock_tower","id":"0c0f3b55-7c8e-4eb4-862b-03eafb5dc9d6","c":[-4176,-2675.4],"a":-2.6779,"ext":[11.1,11],"ring":[[-4178,-2680.9],[-4181.6,-2673.7],[-4174.1,-2670],[-4170.4,-2677.2],[-4178,-2680.9]]},{"key":"chhota_imambara","id":"5cc03349-3f28-4444-af94-a01f3d980287","c":[-4565.5,-2590.2],"a":0.4604,"ext":[44.4,32.9],"ring":[[-4543.3,-2588.2],[-4580.5,-2606.6],[-4587.7,-2592.2],[-4550.5,-2573.7],[-4543.3,-2588.2]]},{"key":"residency","id":"279b1730-fc93-40ed-815d-4579d4bb9161","c":[-2447.8,-1274],"a":1.917,"ext":[22.2,26.1],"ring":[[-2450.1,-1291.3],[-2456.8,-1272.5],[-2453.2,-1271.2],[-2454.4,-1267.9],[-2447,-1265.2],[-2445.3,-1269.8],[-2441,-1268.2],[-2434.7,-1285.7],[-2450.1,-1291.3]]},{"key":"vidhan_sabha","id":"f52e243d-7482-4048-90d2-e220a1a0a670","c":[-593.6,699.8],"a":-2.3149,"ext":[209.6,211.3],"ring":[[-506.6,773.2],[-512.4,766.9],[-493.9,749.9],[-561.8,676],[-557.6,672.2],[-559.5,670.1],[-554.7,662.3],[-548.4,642.1],[-548.5,621.2],[-529.6,602.2],[-542.9,586.3],[-572.9,613.3],[-568.8,629],[-569,645.7],[-575.3,660],[-573.2,662.7],[-586.1,674.8],[-592.6,676.3],[-599.2,669.4],[-617.2,685.8],[-611.6,692.1],[-611.9,699.5],[-627.9,713],[-630.2,711.5],[-645.3,715.6],[-657.7,715],[-674.7,708.2],[-703.4,735.1],[-689.1,751.1],[-668.9,732.6],[-663.3,735.4],[-662,733],[-650.9,734.2],[-629.8,732.2],[-620.3,726.1],[-618.1,728.5],[-613.4,724.2],[-545.8,797.6],[-527.5,780.8],[-521.7,787.1],[-506.6,773.2]]},{"key":"ambedkar_memorial","id":"3bf9d6c5-a7b1-4c95-b4eb-a7e5fa3dd8dd","c":[2425.3,138.8],"a":2.1595,"ext":[216.9,219.2],"ring":[[2316.8,152.1],[2319.3,167.3],[2438.1,248.3],[2452.4,245.3],[2533.6,126.2],[2531.9,110.6],[2413.1,29],[2397.4,31.4],[2316.8,152.1]]}];

function inRing(x: number, z: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** True if a footprint centred at (x, z) belongs to a landmark site (drop it). */
export function isLandmarkSite(x: number, z: number): boolean {
  for (const s of LANDMARK_SITES) {
    const r = Math.max(s.ext[0], s.ext[1]);
    if (Math.abs(x - s.c[0]) > r || Math.abs(z - s.c[1]) > r) continue;
    if (inRing(x, z, s.ring)) return true;
  }
  return false;
}
