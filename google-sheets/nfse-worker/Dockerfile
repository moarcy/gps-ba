# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js emit.js ./

ENV NFSE_WORKER_PORT=8791
EXPOSE 8791
CMD ["node", "server.js"]
