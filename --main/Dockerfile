FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=trusted_ca if [ -f /run/secrets/trusted_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/trusted_ca; fi; npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
RUN --mount=type=secret,id=trusted_ca,target=/etc/ssl/certs/ca-certificates.crt,required=false apk add --no-cache poppler-utils && mkdir -p /app/data/files && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=trusted_ca if [ -f /run/secrets/trusted_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/trusted_ca; fi; npm ci --omit=dev --no-audit --no-fund
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/build-server ./build-server
COPY --chown=node:node ops ./ops
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 FILE_STORAGE_DIR=/app/data/files
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build-server/index.js"]
