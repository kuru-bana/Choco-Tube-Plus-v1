FROM node:20-alpine

WORKDIR /workspace

# フロントエンドの依存パッケージをインストール
COPY app/package*.json ./app/
RUN cd app && npm install

# フロントエンドのソースをコピーしてビルド
COPY app/ ./app/
RUN cd app && npm run build

# サーバーの依存パッケージをインストール
COPY server/package*.json ./server/
RUN cd server && npm install --production

# サーバーのソースをコピー
COPY server/ ./server/

EXPOSE 3001

CMD ["node", "server/server.js"]
