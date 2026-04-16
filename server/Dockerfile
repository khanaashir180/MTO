FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 4000

CMD ["sh", "-c", "npm run pre-deploy-check && npm run migrate && npm run start"]
