FROM python:3.9-slim AS backend

ENV DEBIAN_FRONTEND=noninteractive
RUN echo 'deb http://mirrors.aliyun.com/debian/  bookworm main non-free contrib' > /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian-security/  bookworm-security main' >> /etc/apt/sources.list && \
    echo 'deb http://mirrors.aliyun.com/debian/  bookworm-updates main non-free contrib' >> /etc/apt/sources.list && \
    apt-get update && apt-get install -y curl wget xz-utils && \
    wget -qO- https://mirrors.aliyun.com/nodejs-release/v18.20.8/node-v18.20.8-linux-x64.tar.xz | tar -xJf - -C /usr/local --strip-components=1

WORKDIR /app

COPY backend ./backend/

COPY frontend ./frontend/

WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app/frontend
RUN npm install

WORKDIR /app

EXPOSE 3001 3002

RUN echo '#!/bin/sh' > start.sh && \
    echo 'cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 3002 &' >> start.sh && \
    echo 'cd /app/frontend && npm run dev -- --host 0.0.0.0 --port 3001 &' >> start.sh && \
    echo 'wait' >> start.sh && \
    chmod +x start.sh

CMD ["sh", "start.sh"]
