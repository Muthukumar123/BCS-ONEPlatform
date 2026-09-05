FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY services/adapters/reference-payroll/package.json services/adapters/reference-payroll/package.json
RUN pnpm install --filter @bcs-one/reference-payroll --no-frozen-lockfile
COPY services/adapters/reference-payroll services/adapters/reference-payroll
RUN pnpm --filter @bcs-one/reference-payroll build
RUN pnpm --filter @bcs-one/reference-payroll deploy --prod /prod/reference-payroll

FROM node:22-alpine
WORKDIR /app
COPY --from=build /workspace/services/adapters/reference-payroll/dist ./dist
COPY --from=build /prod/reference-payroll/node_modules ./node_modules
COPY --from=build /prod/reference-payroll/package.json ./package.json
RUN node -e "import('express')"
USER node
ENV PORT=3003
EXPOSE 3003
CMD ["node", "dist/index.js"]
