FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Os assets da dashboard (public/) têm de estar no contexto de build.
# Sem esta verificação a imagem sobe "saudável" mas o dashboard devolve 500.
RUN test -f public/index.html || (echo "ERRO: public/index.html não está no contexto de build. Confirma que a pasta public/ está commitada no repositório." && exit 1)

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["npm", "start"]
