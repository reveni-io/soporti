# Overridable so a build can pull the same image from a mirror instead of
# Docker Hub, which rate-limits anonymous pulls.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}
# The repo tools shell out to real GNU utilities (search_code relies on GNU
# grep's --exclude-dir/--include). Debian packages fd as fd-find, whose binary
# is fdfind, so it is linked back to fd. Video rendering needs ffmpeg.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    grep \
    gawk \
    sed \
    coreutils \
    findutils \
    diffutils \
    ripgrep \
    fd-find \
    jq \
    bash \
    file \
    less \
    tree \
    curl \
    tar \
    gzip \
    xz-utils \
    unzip \
    procps \
    ffmpeg \
  && ln -s /usr/bin/fdfind /usr/local/bin/fd \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Chromium's headless shell renders videos. It is installed at the revision
# playwright-core expects, with its system libraries, into a fixed path.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev \
  && npx playwright-core install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* /root/.npm
COPY src/ ./src/
COPY drizzle/ ./drizzle/
ENV NODE_ENV=production
# Keep PORT in sync with EXPOSE (the app defaults to 3001 otherwise).
# Platforms that inject PORT at runtime (e.g. DO App Platform) override this.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
