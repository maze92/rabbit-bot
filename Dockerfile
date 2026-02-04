# Usar a versão do Node que o Koyeb já estava usando
FROM node:20

# Criar pasta do app
WORKDIR /usr/src/app

# Copiar arquivos de dependências
COPY package*.json ./

# Aqui está o segredo: usar o install comum, ignorando o lock quebrado
RUN npm install

# Copiar o resto dos arquivos do seu bot
COPY . .

# Comando para ligar o bot (ajuste se o seu arquivo principal não for index.js)
CMD ["node", "src/index.js"]
