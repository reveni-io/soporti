FROM node:26-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY drizzle/ ./drizzle/
ENV NODE_ENV=production
# Keep PORT in sync with EXPOSE (the app defaults to 3001 otherwise).
# Platforms that inject PORT at runtime (e.g. DO App Platform) override this.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
