FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro para aproveitar cache de camadas do Docker
COPY package.json package-lock.json* ./
RUN npm install

# Copia o restante do código-fonte
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
