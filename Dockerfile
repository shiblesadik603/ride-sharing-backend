# syntax=docker/dockerfile:1

# --- Stage 1: build -------------------------------------------------------
# `prisma` (the CLI, needed for `prisma generate` here and `migrate deploy`
# at container start) is a regular dependency, not a devDependency — moved
# there deliberately in this phase specifically so `npm ci --omit=dev`
# still installs it and neither stage ever needs jest/nodemon/supertest/
# socket.io-client at all. One dependency tree, not "full install to
# generate, then prune."
FROM node:22-alpine AS builder

# bcrypt's native binding ships prebuilt binaries for glibc, not Alpine's
# musl libc — without these, npm falls back to compiling from source and
# fails outright on a bare Alpine image. A well-known, recurring gotcha
# for this exact combination (Node + bcrypt + Alpine), not a hypothetical
# one — installed here so the fallback path actually works when it's hit.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY . .

RUN npx prisma generate

# --- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Never run as root in the final image — a compromised dependency or a
# request-smuggling bug in any of this app's own code shouldn't also hand
# an attacker root inside the container.
RUN addgroup -S nodejs && adduser -S nodeuser -G nodejs

COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodeuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodeuser:nodejs /app/src ./src
COPY --from=builder --chown=nodeuser:nodejs /app/scripts ./scripts
COPY --chown=nodeuser:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodeuser

EXPOSE 4000

# Liveness/readiness for orchestrators (Docker Compose, ECS, Kubernetes) —
# reuses the same /health endpoint a load balancer would check, so "the
# container is healthy" and "the app is actually serving traffic
# correctly" are the same question, not two separate ones that can
# disagree. Plain Node, not wget/curl — busybox's wget behaves subtly
# differently across Alpine versions and neither tool is guaranteed
# present on every base image; Node itself always is, since it's the
# entire point of this image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
