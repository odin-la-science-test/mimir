# Utilise une image Node.js officielle
FROM node:18-slim

# Installe ffmpeg (nécessaire pour le module vocal)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Définit le répertoire de travail
WORKDIR /app

# Copie package.json et package-lock.json
COPY package*.json ./

# Installe les dépendances
RUN npm ci --only=production

# Copie le code source
COPY . .

# Expose le port (pour les health checks)
EXPOSE 8080

# Démarre le bot
CMD ["node", "index.js"]
