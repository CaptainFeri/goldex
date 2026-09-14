# The official Playwright image, so the browser build and the client library
# always match. The backend's node:22-alpine base cannot be reused here:
# Playwright does not support Alpine, and keeping the browser in its own image
# also keeps Chromium's memory off the backend.
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# Playwright's image ships a `pwuser`; the browser should not be root's.
USER pwuser

EXPOSE 3000
CMD ["node", "dist/main"]
