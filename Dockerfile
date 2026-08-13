# Utilise une image Node.js officielle
# Node >= 22.12.0 requis par @discordjs/voice >= 0.19 (protocole DAVE,
# voir docs/adr/0013-cause-reelle-echec-vocal-dave.md)
FROM node:22-slim

# Installe ffmpeg (nécessaire pour le module vocal)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Définit le répertoire de travail
WORKDIR /app

# Copie package.json et package-lock.json
COPY package*.json ./

# Installe les dépendances. npm install (pas npm ci) : les dépendances
# WASM optionnelles de @snazzah/davey (fallback emnapi pour plateformes
# sans binaire natif précompilé) ne se résolvent pas identiquement d'une
# plateforme à l'autre, ce que npm ci refuse strictement.
RUN npm install --omit=dev

# Copie le code source
COPY . .

# Expose le port (pour les health checks)
EXPOSE 8080

# Démarre le bot
CMD ["node", "index.js"]
