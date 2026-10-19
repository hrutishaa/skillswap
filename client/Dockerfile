# Build from the repo root: docker build -f client/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --ignore-scripts
COPY client ./client
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN cd client && npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
