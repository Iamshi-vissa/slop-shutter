# Slop Shutter: web app + HTTP API.
#   docker build -t slop-shutter .
#   docker run -p 8080:8080 slop-shutter

# 1. Build the web app.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY web ./web
COPY src ./src
COPY samples ./samples
RUN npm run build

# 2. Run: the server and API need no dependencies, only the built app.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY package.json server.js ./
COPY server ./server
COPY src ./src
COPY bin ./bin
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]
