FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY public ./public
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
EXPOSE 8787
RUN mkdir -p /app/data
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
