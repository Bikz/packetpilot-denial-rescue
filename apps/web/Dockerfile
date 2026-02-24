FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --filter web... --ignore-scripts

COPY apps/web apps/web
COPY packages/ui packages/ui

RUN pnpm --filter web build

FROM node:20-alpine AS runner
WORKDIR /workspace

RUN corepack enable

COPY --from=builder /workspace/package.json /workspace/pnpm-workspace.yaml /workspace/turbo.json ./
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/web ./apps/web
COPY --from=builder /workspace/packages/ui ./packages/ui

WORKDIR /workspace/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
