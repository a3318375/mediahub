# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /web
COPY --from=uiarc package.json package-lock.json ./
RUN npm ci
COPY --from=uiarc src ./src
COPY --from=uiarc index.html tsconfig.json vite.config.ts ./
COPY --from=uiarc tests ./tests
RUN npm test && npm run build

FROM golang:1.26-bookworm AS backend
WORKDIR /src
COPY . .
RUN if ! grep -q 'func WaitForAsyncTasks' third_party/pansou/plugin/plugin.go; then git -C third_party/pansou apply /src/third_party/pansou-lifecycle.patch; fi \
 && if ! grep -q 'func NewCheckServiceWithCachePath' third_party/pansou/service/check_service.go; then git -C third_party/pansou apply /src/third_party/pansou-check-lifecycle.patch; fi \
 && if ! test -f third_party/pansou/service/subscription_search.go || ! grep -q '_wait_complete' third_party/pansou/plugin/plugin.go; then git -C third_party/pansou apply /src/third_party/pansou-subscription-search.patch; fi
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/mediahub ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /out/mediahub /app/mediahub
COPY --from=frontend /web/dist /app/web
ENV HTTP_ADDR=:18080 MEDIAHUB_DATA_DIR=/data MEDIAHUB_WEB_DIR=/app/web TZ=Asia/Hong_Kong GIN_MODE=release
EXPOSE 18080
VOLUME ["/data", "/strm"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fsS http://127.0.0.1:18080/api/health || exit 1
ENTRYPOINT ["/app/mediahub"]
