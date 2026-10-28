FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN npm install --global @larksuite/cli@1.0.92
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4319 FOLIO_DATA_DIR=/var/lib/folio/data
# The CLI's Linux auth/config must also survive container replacement.
ENV HOME=/var/lib/folio/home
RUN mkdir -p /var/lib/folio/data /var/lib/folio/home && chown -R node:node /var/lib/folio /app
USER node
WORKDIR /var/lib/folio
EXPOSE 4319
CMD ["node", "/app/scripts/cloud-server.mjs"]
