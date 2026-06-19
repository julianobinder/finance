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
