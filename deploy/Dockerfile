FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm i -g tsx@4.19.2
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["tsx", "src/server.ts"]
