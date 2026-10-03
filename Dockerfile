FROM node:24.11.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY prisma.config.ts ./prisma.config.ts
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24.11.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DATALOM_DATA_DIR=/data
RUN groupadd --system datalom && useradd --system --gid datalom --create-home datalom
COPY --from=build --chown=datalom:datalom /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build --chown=datalom:datalom /app/node_modules ./node_modules
COPY --from=build --chown=datalom:datalom /app/apps ./apps
COPY --from=build --chown=datalom:datalom /app/packages ./packages
COPY --from=build --chown=datalom:datalom /app/scripts ./scripts
COPY --from=build --chown=datalom:datalom /app/prisma.config.ts ./prisma.config.ts
RUN mkdir -p /data && chown datalom:datalom /data
USER datalom
EXPOSE 4317
VOLUME ["/data"]
CMD ["node", "apps/server/dist/main.js"]
