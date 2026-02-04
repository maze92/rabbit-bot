# Imagem base leve com Node 20
FROM node:20-alpine

# Diretório de trabalho dentro do container
WORKDIR /app

# Copiar apenas ficheiros de dependências primeiro (cache de layers)
COPY package*.json ./

# Instalar dependências
# - npm install em vez de npm ci para não rebentar com lockfile "não perfeito"
RUN npm install

# Copiar o resto do código
COPY . .

# Definir ambiente de produção
ENV NODE_ENV=production

# Porta default dentro do container (Koyeb injeta PORT, mas isto não atrapalha)
ENV PORT=8000

# Expor a porta (puramente informativo para orquestradores)
EXPOSE 8000

# Comando de arranque
CMD ["npm", "start"]
