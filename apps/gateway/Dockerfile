FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/package.json
RUN pnpm install --filter @bcs-one/gateway --no-frozen-lockfile
COPY apps/gateway apps/gateway
RUN pnpm --filter @bcs-one/gateway build
RUN pnpm --filter @bcs-one/gateway deploy --prod /prod/gateway

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/apps/gateway/dist ./dist
COPY --from=build /prod/gateway/node_modules ./node_modules
COPY --from=build /prod/gateway/package.json ./package.json
RUN node -e "import('express')"
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
