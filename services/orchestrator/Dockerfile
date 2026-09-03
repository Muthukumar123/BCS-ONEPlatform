FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/orchestrator/package.json services/orchestrator/package.json
RUN pnpm install --filter @bcs-one/orchestrator --no-frozen-lockfile
COPY services/orchestrator services/orchestrator
RUN pnpm --filter @bcs-one/orchestrator build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/orchestrator/dist ./dist
COPY --from=build /workspace/services/orchestrator/node_modules ./node_modules
COPY services/orchestrator/package.json ./package.json
USER node
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
