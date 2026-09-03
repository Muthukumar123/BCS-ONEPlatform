FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/package.json
RUN pnpm install --filter @bcs-one/gateway --no-frozen-lockfile
COPY apps/gateway apps/gateway
RUN pnpm --filter @bcs-one/gateway build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/apps/gateway/dist ./dist
COPY --from=build /workspace/apps/gateway/node_modules ./node_modules
COPY apps/gateway/package.json ./package.json
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
