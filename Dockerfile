# ---- Build stage ----
# Roda na arquitetura de quem builda (BUILDPLATFORM): o bundle e so HTML/JS/CSS, entao o build
# multi-arch (amd64 + arm64, VPS Ampere) nao paga o npm emulado pelo QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

# Cache de dependencias: instala antes de copiar o codigo-fonte.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration production

# ---- Runtime stage ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
