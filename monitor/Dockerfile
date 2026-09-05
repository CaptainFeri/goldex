FROM node:22-alpine

# docker-cli-compose provides the "docker compose" (v2) plugin so the test
# runner can bring up the shared test infra from inside the container.
RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./
COPY public ./public

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["node", "server.js"]
