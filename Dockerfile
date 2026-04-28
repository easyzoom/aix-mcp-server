FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

# ---

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY mcp-plugins.json mcp-proxy.json mcp-registry.json llm-config.json ./
COPY --from=builder /app/dist/ dist/

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
CMD ["http"]
