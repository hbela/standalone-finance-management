# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci -w @wise-finance/api -w @wise-finance/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @wise-finance/shared \
 && npm run build -w @wise-finance/api


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev -w @wise-finance/api \
 && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist

ENV HOST=0.0.0.0 \
    PORT=4000

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
