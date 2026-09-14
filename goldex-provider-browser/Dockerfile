# The official Playwright image, so the browser build and the client library
# always match. The backend's node:22-alpine base cannot be reused here:
# Playwright does not support Alpine, and keeping the browser in its own image
# also keeps Chromium's memory off the backend.
#
# This tag and the `playwright` version in package.json must be the SAME
# version, exactly. The image ships one Chromium build — the one that release
# expects — so a newer client looks for a revision that is not in the image and
# every launch fails with "Executable doesn't exist". package.json pins the
# version without a caret for that reason, and the check below refuses to build
# an image where the two have drifted apart.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS builder

ARG PLAYWRIGHT_VERSION=1.63.0

WORKDIR /app
COPY package*.json ./
RUN npm ci \
 && installed="$(node -p "require('playwright/package.json').version")" \
 && if [ "$installed" != "$PLAYWRIGHT_VERSION" ]; then \
      echo "playwright $installed does not match this image ($PLAYWRIGHT_VERSION); the browser build it expects is not installed here" >&2; \
      exit 1; \
    fi

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# Playwright's image ships a `pwuser`; the browser should not be root's.
USER pwuser

EXPOSE 3000
CMD ["node", "dist/main"]
