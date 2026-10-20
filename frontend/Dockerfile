# --- build: Angular with prerendered pages ---------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# the split app shell for the guide pages (scripts/guide-shell.mjs, nginx SSI)
RUN npx ng build && node scripts/guide-shell.mjs

# --- serve: nginx (static pages + proxy to Django) --------------------------
FROM nginx:1.29-alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
