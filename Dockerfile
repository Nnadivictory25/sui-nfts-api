FROM oven/bun:latest

WORKDIR /app

# Install dependencies
COPY package.json bun.lock /app/
RUN bun install

# Copy remaining files
COPY . .

EXPOSE 3000

# Default command: run the app
CMD ["bun", "run", "index.ts"]
