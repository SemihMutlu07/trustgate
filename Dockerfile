# Stage 1: Build & Dependencies
FROM node:20-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@10.33.3

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
COPY test ./test
COPY demo ./demo
COPY public ./public

RUN pnpm build

# Stage 2: Runtime Container for Cloud Run
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN npm install -g pnpm@10.33.3

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/demo ./demo

EXPOSE 8080

CMD ["node", "dist/src/server.js"]
