# AdVault Web — dev image (Vite dev server + proxy to the API service)
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @advault/types build

EXPOSE 5173
CMD ["pnpm", "--filter", "@advault/web", "dev", "--", "--host"]
