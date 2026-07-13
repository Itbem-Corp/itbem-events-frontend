# ---------- Base image ----------
FROM node:22.23.1-bookworm-slim AS base
WORKDIR /app

# Public URLs are compiled into the Astro client bundle during the build.
ARG PUBLIC_EVENTS_URL=http://localhost:8080/
ARG PUBLIC_DASHBOARD_URL=http://localhost:3000
ENV PUBLIC_EVENTS_URL=${PUBLIC_EVENTS_URL}
ENV PUBLIC_DASHBOARD_URL=${PUBLIC_DASHBOARD_URL}

# Copy only package files to keep dependency layers cacheable.
COPY package.json package-lock.json ./

# ---------- Production dependencies ----------
FROM base AS prod-deps
RUN npm ci --omit=dev

# ---------- Build step ----------
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ---------- Runtime image ----------
FROM base AS runtime

# Wrangler is a declared runtime dependency and serves the Cloudflare Pages
# artifact locally with the same worker semantics used in production.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY scripts/serve-cloudflare.mjs ./scripts/serve-cloudflare.mjs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV WRANGLER_SEND_METRICS=false
EXPOSE 4321

CMD ["node", "./scripts/serve-cloudflare.mjs"]
