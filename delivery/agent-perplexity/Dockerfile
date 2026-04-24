FROM oven/bun:1.1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install
COPY sales-server.ts ./
EXPOSE 8080
CMD ["bun", "run", "sales-server.ts"]
