FROM node:22-alpine AS build

WORKDIR /app
ENV VITE_API_URL=
COPY ml-drift-lens-frontend/package*.json ./
RUN npm ci
COPY ml-drift-lens-frontend ./
RUN npx vite build

FROM nginx:1.27-alpine
COPY ml-drift-lens-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN sed -i 's#^[[:space:]]*pid[[:space:]].*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && chown -R 101:101 /var/cache/nginx /var/log/nginx
EXPOSE 8080
