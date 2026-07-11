# AdVault API — dev/staging image (monorepo build context = repo root)
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @advault/types build && pnpm --filter @advault/api build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
