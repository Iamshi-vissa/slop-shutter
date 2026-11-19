# Slop Shutter: web app + HTTP API in one small image.
#   docker build -t slop-shutter .
#   docker run -p 8080:8080 slop-shutter
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080

# No dependencies to install: copy only what the server needs.
COPY package.json server.js ./
COPY server ./server
COPY src ./src
COPY web ./web
COPY samples ./samples
COPY bin ./bin

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]
