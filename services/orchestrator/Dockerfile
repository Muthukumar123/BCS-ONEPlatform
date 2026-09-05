FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/orchestrator/package.json services/orchestrator/package.json
RUN pnpm install --filter @bcs-one/orchestrator --no-frozen-lockfile
COPY services/orchestrator services/orchestrator
RUN pnpm --filter @bcs-one/orchestrator build
RUN pnpm --filter @bcs-one/orchestrator deploy --prod /prod/orchestrator

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/orchestrator/dist ./dist
COPY --from=build /prod/orchestrator/node_modules ./node_modules
COPY --from=build /prod/orchestrator/package.json ./package.json
RUN node -e "Promise.all([import('express'), import('@azure/identity'), import('openai'), import('@langchain/langgraph'), import('@langchain/langgraph-checkpoint-postgres'), import('pg')])"
USER node
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
