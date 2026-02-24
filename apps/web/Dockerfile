FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/fhir/package.json packages/fhir/package.json
COPY packages/templates/package.json packages/templates/package.json

RUN pnpm install --filter web... --ignore-scripts

COPY apps/web apps/web
COPY packages/ui packages/ui
COPY packages/fhir packages/fhir
COPY packages/templates packages/templates

RUN pnpm --filter web build

FROM node:20-alpine AS runner
WORKDIR /workspace

RUN corepack enable

COPY --from=builder /workspace/package.json /workspace/pnpm-workspace.yaml /workspace/turbo.json ./
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/web ./apps/web
COPY --from=builder /workspace/packages/ui ./packages/ui
COPY --from=builder /workspace/packages/fhir ./packages/fhir
COPY --from=builder /workspace/packages/templates ./packages/templates

WORKDIR /workspace/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
