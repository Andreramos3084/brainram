FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npx tsc

RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
CMD ["node", "dist/api/server.js"]
