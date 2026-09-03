FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/mcp-server/package.json services/mcp-server/package.json
RUN pnpm install --filter @bcs-one/mcp-server --no-frozen-lockfile
COPY services/mcp-server services/mcp-server
RUN pnpm --filter @bcs-one/mcp-server build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/mcp-server/dist ./dist
COPY --from=build /workspace/services/mcp-server/node_modules ./node_modules
COPY services/mcp-server/package.json ./package.json
USER node
ENV PORT=3002
EXPOSE 3002
CMD ["node", "dist/index.js"]
