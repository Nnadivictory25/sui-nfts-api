# Use official bun image for production
FROM oven/bun:1.1.13 as base

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb /app/
RUN bun install

# Copy remaining files
COPY . .

EXPOSE 3000

# Default command: run the app
CMD ["bun", "run", "index.ts"]
