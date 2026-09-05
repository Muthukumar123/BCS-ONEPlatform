FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/eval-runner/package.json services/eval-runner/package.json
RUN pnpm install --filter @bcs-one/eval-runner --no-frozen-lockfile
COPY services/eval-runner services/eval-runner
RUN pnpm --filter @bcs-one/eval-runner build
RUN pnpm --filter @bcs-one/eval-runner deploy --prod /prod/eval-runner

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/eval-runner/dist ./dist
COPY --from=build /prod/eval-runner/node_modules ./node_modules
COPY --from=build /prod/eval-runner/package.json ./package.json
USER node
CMD ["node", "dist/index.js"]
