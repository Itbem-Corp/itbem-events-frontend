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

# Copy built app
COPY --from=build /app/dist ./dist

# Configure host and port
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

# Run the app
CMD ["node", "./dist/server/entry.mjs"]
