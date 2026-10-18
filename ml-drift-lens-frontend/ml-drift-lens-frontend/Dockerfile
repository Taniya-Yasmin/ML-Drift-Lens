# Stage 1 — build the React/Vite app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — serve the static bundle with nginx
FROM nginx:1.27-alpine AS runner

# Remove the default catch-all config
RUN rm /etc/nginx/conf.d/default.conf

# The nginx image renders templates with runtime environment variables. This
# lets Railway supply PORT and the private backend origin without rebuilding.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built assets from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
