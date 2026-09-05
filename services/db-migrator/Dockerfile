FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/db-migrator/package.json services/db-migrator/package.json
RUN pnpm install --filter @bcs-one/db-migrator --no-frozen-lockfile
COPY services/db-migrator services/db-migrator
RUN pnpm --filter @bcs-one/db-migrator build
RUN pnpm --filter @bcs-one/db-migrator deploy --prod /prod/db-migrator

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/db-migrator/dist ./dist
COPY --from=build /workspace/services/db-migrator/migrations ./migrations
COPY --from=build /prod/db-migrator/node_modules ./node_modules
COPY --from=build /prod/db-migrator/package.json ./package.json
USER node
CMD ["node", "dist/index.js"]
