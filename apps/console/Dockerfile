FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/console/package.json apps/console/package.json
RUN pnpm install --filter @bcs-one/console --no-frozen-lockfile
COPY apps/console apps/console
RUN pnpm --filter @bcs-one/console build
RUN pnpm --filter @bcs-one/console deploy --prod /prod/console

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/apps/console/dist ./dist
COPY --from=build /workspace/apps/console/public ./public
COPY --from=build /prod/console/node_modules ./node_modules
COPY --from=build /prod/console/package.json ./package.json
RUN node -e "import('express')"
USER node
ENV PORT=3005
EXPOSE 3005
CMD ["node", "dist/server.js"]
