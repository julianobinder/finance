# Build Stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies using clean install mode
RUN npm ci

# Copy project source codebase
COPY . .

# Build application with Vite bypassing strict compiler errors
RUN npx vite build

# Dev Stage — Vite's dev server with HMR. Not part of the default build path
# (only built when explicitly targeted); source is bind-mounted at runtime by
# docker-compose.override.yml, so `COPY . .` here just makes the image usable
# standalone too. Placed before the final stage so it stays opt-in: `docker
# build` / `docker compose build` with no --target still produce the nginx
# production image below.
FROM node:20-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000"]

# Runner Stage
FROM nginx:alpine

# Copy built production-ready static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace standard default virtualhost server block config with proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose nginx standard HTTP port
EXPOSE 80

# Launch server process in foreground mode
CMD ["nginx", "-g", "daemon off;"]
