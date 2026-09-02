# Deploying Lucknow LENS

Lucknow LENS is one Node process. `server.ts` serves the `/api/*` routes and
the built frontend from the same origin, so there is no separate static host,
no CDN requirement and no CORS configuration to get wrong.

The thing that makes this deployment unusual is not the code — it is the data.

## 1. What actually has to be on the disk

| Path | Size | In git? | Where it comes from |
| --- | --- | --- | --- |
| `public/overture_tiles_full` | ~474 MB | yes | committed; the streamed tile source and the input to every bake |
| `public/hlod` | ~224 MB | **no** | `npm run bake`, from the tiles above |
| `public/overture` | ~7 MB | yes | committed; the Hazratganj overview extract |
| `data/` | ~40 MB | yes | offline preprocessing inputs; not read at runtime |

`npm run build` runs `prebuild` first, which checks for
`public/hlod/hlod_manifest.json` and runs `npm run bake` if it is missing. So a
fresh clone builds without manual steps — it just takes a while the first time.

The bake is the memory-hungry step: it is launched with
`--max-old-space-size=8192` and streams 6,944 tile files. **A build machine with
less than ~8 GB of RAM will OOM here.** If your host's build container is
smaller than that, bake locally and ship `public/hlod` into the image instead
of regenerating it (drop the `public/hlod` line from `.dockerignore`).

`vite build` copies `public/` into `dist/`, so the finished `dist/` is roughly
700 MB. Size your host's disk and image registry accordingly.

## 2. Container

```bash
docker build -t lucknow-lens .
```

```bash
docker run -p 3000:3000 --env-file .env lucknow-lens
```

The image is a two-stage build: the builder installs dev dependencies and runs
`npm run build`; the runtime stage keeps only `node_modules` (production) and
`dist/`. It binds `0.0.0.0` and honours an injected `PORT`, which is what
Fly.io, Railway, Render, Cloud Run and a plain VPS all expect.

Point your host's health check at `GET /api/health`. It returns per-provider
live-feed status and is cheap — it reads cached feed state, it does not call
upstream providers.

## 3. Environment

Copy `.env.example` to `.env` and fill in what you have. **Every key is
optional.** A feed with no key reports `status: "unavailable"` and the UI says
so; nothing is ever fabricated to fill the gap.

| Variable | Effect if unset |
| --- | --- |
| `PORT` | defaults to 3000 |
| `GEMINI_API_KEY` | the AI analyst falls back to deterministic rule-based answers |
| `OPENSKY_USER` / `OPENSKY_PASS` | flights still work anonymously, on a low daily quota |
| `RAILRADAR_API_KEY` | the railway layer reports unavailable |
| `TOMTOM_API_KEY` | the traffic layer reports unavailable |

Secrets are read server-side only and never reach the bundle. GDELT (news)
needs no key.

## 4. Serving many people at once

Three things already in `server.ts` matter here, and one thing outside it does.

**Shared upstream polling.** Every live provider is wrapped in a `CachedFeed`,
so one thousand connected browsers still produce one poll per provider per
interval. Client count does not multiply your upstream quota.

**Rate limiting.** `/api/*` is limited to 180 requests per minute per IP, in
process memory, returning `429` with `Retry-After` and `RateLimit-*` headers.
This is per-instance: run N instances and the effective limit is N x 180. It
protects the live-feed providers and the analyst key from a single abusive
client — it is not a defence against a distributed flood, which belongs at your
edge or CDN.

**Static caching.** Hashed bundle assets and the HLOD binaries are served
`immutable` (HLOD URLs carry a `?v=<bake timestamp>`); tile JSON gets a day with
revalidation. Without these headers each visitor re-downloads a large slice of
700 MB, which is the single biggest cost of hosting this for a crowd. If you put
a CDN in front, these are the headers it will honour.

**`trust proxy` is set to 1.** That is correct behind exactly one reverse proxy
or load balancer. Behind two, or behind none, the client IP the rate limiter
sees will be wrong — adjust the value in `server.ts` to match your topology.

The process handles `SIGTERM` and `SIGINT` by draining connections, with a 10 s
hard deadline, so rolling deploys do not cut requests mid-flight.

## 5. Client requirements

The renderer needs WebGL 2. `src/city/deviceProfile.ts` resolves a tier once at
startup from pointer type, core count and device memory — never from the user
agent — and scales pixel ratio, antialiasing, decode worker count, streaming
radius, lamp glow and shadows to match. Phones land on the `mobile` or `low`
tier automatically; there is nothing to configure per device.

Below a 640 px viewport the UI switches to a compact layout: the dashboard
becomes a sheet behind a single control, and the developer panels drop out. The
`MAP ONLY` control (or `m`, or `Esc` to leave) unmounts every panel on any
viewport.

## 6. What is not automated

There is no deploy job in `.github/workflows/ci.yml` — CI type-checks, builds
and smoke-tests, and stops there. Adding one means choosing a host and giving
Actions a credential for it, which is a decision for whoever owns the
deployment, not a default worth guessing at.
