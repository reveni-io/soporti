FROM node:22-alpine AS build
WORKDIR /app
# Empty default = same-origin API calls: every client fetch is
# `${VITE_API_URL}/api/...`, so an empty value makes them relative and nginx
# proxies them to the server. Set it only when the API lives on another origin.
ARG VITE_API_URL=
ARG VITE_GOOGLE_CLIENT_ID=
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.31-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Where nginx proxies /api requests; the default matches the `server` service
# in docker-compose.prod.yml. Override at runtime for other topologies.
ENV API_PROXY_TARGET=http://server:8080
EXPOSE 80
