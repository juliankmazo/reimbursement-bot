FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

RUN pnpm build

EXPOSE 80

ENV NODE_OPTIONS=--openssl-legacy-provider

CMD ["node", "dist/index.js"]