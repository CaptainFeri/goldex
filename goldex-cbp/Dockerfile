# Stage 1: Build
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy only package files for dependency installation
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production Image
FROM node:22-alpine AS runner

# Set the working directory
WORKDIR /app

# Copy only the build artifacts and production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create and set appropriate permissions for a static directory
RUN mkdir -p /app/public && chmod 777 /app/public
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# Expose the application port
EXPOSE 4100

# Use a non-root user for security
USER node

# Start the application
CMD ["node", "dist/main"]
