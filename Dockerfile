# ---------- Base image ----------
FROM node:lts AS base
WORKDIR /app

# Accept public API URL at build time
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

# Copy only package files to install dependencies
COPY package.json package-lock.json ./

# ---------- Production dependencies ----------
FROM base AS prod-deps
RUN npm install --omit=dev

# ---------- Full dependencies for build ----------
FROM base AS build-deps
RUN npm install

# ---------- Build step ----------
FROM build-deps AS build
COPY . .
RUN npm run build

# ---------- Runtime image ----------
FROM base AS runtime

# Copy production node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built app (server and client)
COPY --from=build /app/dist ./dist

# COPY estáticos del frontend a un volumen accesible por NGINX (nuevo paso)
RUN mkdir -p /public
COPY --from=build /app/dist/client /public

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
