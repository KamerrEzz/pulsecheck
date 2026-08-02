FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN pnpm install

COPY . .
RUN pnpm install --prod --offline 2>/dev/null || pnpm install --prod

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

RUN apk add --no-cache wget

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "src/app.js"]