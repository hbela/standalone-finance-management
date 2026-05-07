# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG EXPO_PUBLIC_CONVEX_URL
ARG EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS=true

ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \
    EXPO_PUBLIC_CONVEX_URL=$EXPO_PUBLIC_CONVEX_URL \
    EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS=$EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci -w @wise-finance/mobile --include-workspace-root

COPY apps/mobile apps/mobile

WORKDIR /app/apps/mobile
RUN npx expo export --platform web --output-dir dist


FROM nginx:1.27-alpine AS runtime

COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
