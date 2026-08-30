FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 python3-pip curl git jq \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages yt-dlp youtube-search
RUN npm install -g mcporter

RUN useradd -m -s /bin/bash agentreach
USER agentreach
WORKDIR /home/agentreach/app

COPY --chown=agentreach:agentreach package*.json ./
RUN npm install

COPY --chown=agentreach:agentreach . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main"]