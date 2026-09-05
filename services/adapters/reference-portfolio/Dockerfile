FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/adapters/reference-portfolio/package.json services/adapters/reference-portfolio/package.json
RUN pnpm install --filter @bcs-one/reference-portfolio --no-frozen-lockfile
COPY services/adapters/reference-portfolio services/adapters/reference-portfolio
RUN pnpm --filter @bcs-one/reference-portfolio build
RUN pnpm --filter @bcs-one/reference-portfolio deploy --prod /prod/reference-portfolio

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/adapters/reference-portfolio/dist ./dist
COPY --from=build /prod/reference-portfolio/node_modules ./node_modules
COPY --from=build /prod/reference-portfolio/package.json ./package.json
RUN node -e "Promise.all([import('express'), import('zod'), import('pino')])"
USER node
ENV PORT=3004
EXPOSE 3004
CMD ["node", "dist/index.js"]
