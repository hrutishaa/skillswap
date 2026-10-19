# Build from the repo root: docker build -f server/Dockerfile .
FROM node:20-alpine
WORKDIR /app
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
WORKDIR /app/server
EXPOSE 4000
CMD ["sh", "-c", "node src/migrate.js && node src/seed.js --if-empty && node src/index.js"]
