# Lucknow LENS ships as one Node process: Express serves both the API routes
# and the built static frontend (vite build copies public/ — the tile data,
# HLOD bins and Overture GeoJSON — straight into dist/). This image works on
# any container host (Fly.io, Railway, Render, Cloud Run, a bare VPS) without
# a host-specific config.

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Most hosts inject PORT; 3000 is the server's own default (see server.ts).
ENV PORT=3000
EXPOSE 3000

# GET /api/health reports per-provider live-feed status — wire your host's
# health check to it.
CMD ["node", "dist/server.cjs"]
