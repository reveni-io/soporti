FROM node:22-alpine
# The repo tools shell out to real GNU utilities. BusyBox's applets are not
# supersets: its grep has no --exclude-dir/--include and exits 2 on them, which
# made every search_code call fail in the deployed image.
RUN apk add --no-cache \
  git \
  grep \
  gawk \
  sed \
  coreutils \
  findutils \
  diffutils \
  ripgrep \
  fd \
  jq \
  bash \
  file \
  less \
  tree \
  curl \
  tar \
  gzip \
  xz \
  unzip \
  procps
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
