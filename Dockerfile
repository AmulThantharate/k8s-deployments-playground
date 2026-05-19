FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DEPLOY_COLOR=unknown
ENV APP_VERSION=0.0.0

CMD ["node", "server.js"]
