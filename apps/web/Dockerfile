FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
 
FROM base AS builder
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @repo/web --docker
 
FROM base AS installer
# Accept build argument for environment (dev/stg/prd only) - REQUIRED
ARG ENV
# Make ARG available as environment variable in RUN commands
ENV BUILD_ENV=${ENV}
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app
 
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
ENV CYPRESS_INSTALL_BINARY=0
RUN --mount=type=cache,target=/pnpm/store pnpm install
 
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Validate and copy the specific .env file based on the BUILD_ENV environment variable
# Only accepts: dev, stg, or prd - ENV argument is REQUIRED
RUN --mount=type=bind,from=builder,source=/app,target=/builder-app \
    if [ -z "${BUILD_ENV}" ]; then \
      echo "Error: ENV build argument is required. Use --build-arg ENV=dev|stg|prd" && exit 1; \
    fi && \
    case "${BUILD_ENV}" in \
      dev|stg|prd) \
        if [ -f "/builder-app/.env.${BUILD_ENV}" ]; then \
          cp "/builder-app/.env.${BUILD_ENV}" .env && \
          echo "Loaded .env.${BUILD_ENV}" || true; \
        else \
          echo "Error: .env.${BUILD_ENV} not found" && exit 1; \
        fi \
        ;; \
      *) \
        echo "Error: ENV must be one of: dev, stg, prd. Got: ${BUILD_ENV}" && exit 1; \
        ;; \
    esac

# Load NEXT_PUBLIC_* variables from the selected .env file and run build
# set -a exports all variables, then we source the .env file if it exists
RUN set -a && \
    [ -f .env ] && . .env || true && \
    set +a && \
    pnpm turbo run build --filter=@repo/web...
 
FROM base AS runner
WORKDIR /app
 
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs
 
COPY --from=installer /app/apps/web/next.config.ts .
COPY --from=installer /app/apps/web/package.json .
 
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
 
USER nextjs
 
EXPOSE 3000
 
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
 
CMD ["node", "apps/web/server.js"]