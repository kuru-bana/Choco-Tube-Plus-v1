# Choco-Tube-Plus デプロイガイド

## 必要なフォルダ・ファイル

```
choco-tube-plus/
├── server/              ← バックエンド（必須）
│   ├── server.js
│   ├── config.js
│   ├── utils.js
│   ├── package.json
│   └── routes/          ← APIルート一式（必須）
├── app/                 ← フロントエンド
│   ├── src/             ← Reactソースコード（ビルド前に必要）
│   ├── public/          ← 静的ファイル（chat.html など）
│   ├── index.html
│   ├── package.json
│   └── dist/            ← ビルド済みファイル（起動に必要。ビルドで生成）
├── Dockerfile
├── render.yaml
├── fly.toml
├── Procfile
└── package.json
```

### 起動に最低限必要なもの
| フォルダ/ファイル | 説明 |
|---|---|
| `server/` | バックエンドサーバー本体 |
| `server/routes/` | APIルート（必須） |
| `server/node_modules/` | `npm install` で生成 |
| `app/dist/` | ビルド済みフロントエンド（`npm run build` で生成） |
| `app/public/` | chat.html など静的ファイル |

> `node_modules/` は git に含めない。デプロイ先でインストールする。  
> `app/dist/` はビルドコマンドで生成されるため、git に含めなくてよい。

---

## ビルド・起動コマンド（共通）

```bash
# フロントエンドのビルド
cd app && npm install && npm run build

# サーバーの起動
cd server && npm install && node server.js
```

ポートは環境変数 `PORT` で変更できます（デフォルト: 3001）。

---

## 各ホスティングサービスへのデプロイ

---

### Render.com（おすすめ・無料プランあり）

**ファイル**: `render.yaml`（すでに作成済み）

**手順**:
1. [render.com](https://render.com) にサインアップ
2. ダッシュボードから **"New → Blueprint"** を選択
3. GitHub リポジトリを接続し、このリポジトリを選択
4. `render.yaml` が自動検出されてデプロイ設定が読み込まれる
5. **"Apply"** をクリック → 自動でビルド＆デプロイ

**手動設定する場合**:
- Type: `Web Service`
- Build Command: `cd app && npm install && npm run build && cd ../server && npm install`
- Start Command: `cd server && node server.js`
- Node Version: 20

---

### Railway.app（簡単・GitHub連携）

**ファイル**: `Dockerfile`（自動検出）

**手順**:
1. [railway.app](https://railway.app) にサインアップ
2. ダッシュボードから **"New Project → Deploy from GitHub repo"**
3. リポジトリを選択
4. Railway が `Dockerfile` を自動検出してビルド
5. デプロイ完了後、**Settings → Domains** でURLを確認

**手動でコマンドを設定する場合**（Dockerfileを使わない場合）:
- Build Command: `cd app && npm install && npm run build && cd ../server && npm install`
- Start Command: `cd server && node server.js`

---

### Fly.io（高性能・無料枠あり）

**ファイル**: `fly.toml` + `Dockerfile`（すでに作成済み）

**手順**:
1. [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) をインストール
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
2. ログイン
   ```bash
   fly auth login
   ```
3. アプリを初回デプロイ（`fly.toml` の `app` 名はユニークである必要あり）
   ```bash
   fly apps create choco-tube-plus
   fly deploy
   ```
4. URLは `https://choco-tube-plus.fly.dev` のような形式

> `fly.toml` の `app = "choco-tube-plus"` の部分は世界でユニークな名前に変更してください。

---

### Heroku（有料プランのみ）

**ファイル**: `Procfile` + `package.json`（すでに作成済み）

**手順**:
1. [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) をインストール
2. ログイン・アプリ作成
   ```bash
   heroku login
   heroku create choco-tube-plus-yourname
   ```
3. デプロイ
   ```bash
   git add .
   git commit -m "deploy"
   git push heroku main
   ```
4. 自動で `heroku-postbuild`（ビルド）→ `Procfile`（起動）が実行される

---

### Koyeb（無料枠あり・Docker対応）

**ファイル**: `Dockerfile`（すでに作成済み）

**手順**:
1. [koyeb.com](https://www.koyeb.com) にサインアップ
2. **"Create App"** → **"Docker"** を選択
3. GitHub リポジトリを連携し、`Dockerfile` でビルド
4. Port: `3001` を設定
5. **"Deploy"** をクリック

---

### VPS（さくらVPS・ConoHa・Linode など）

**手順**:
1. サーバーに Node.js 20 をインストール
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
   sudo apt-get install -y nodejs
   ```
2. リポジトリをクローン
   ```bash
   git clone https://github.com/あなた/choco-tube-plus.git
   cd choco-tube-plus
   ```
3. ビルド＆起動
   ```bash
   cd app && npm install && npm run build && cd ..
   cd server && npm install
   node server.js
   ```
4. 常時起動には `pm2` を使用
   ```bash
   npm install -g pm2
   pm2 start server/server.js --name choco-tube-plus
   pm2 startup
   pm2 save
   ```

---

### Vercel（フロントエンド＋サーバーレス API）

**ファイル**: `vercel.json` + `api/index.js`（すでに作成済み）

> Vercel はサーバーレス環境のため、Express の一部機能（長時間接続・SSE・ストリーミング）に制限があります。  
> 完全なストリーム再生機能が必要な場合は Render / Railway / Fly.io を推奨します。

**手順**:
1. [vercel.com](https://vercel.com) にサインアップ（GitHub連携）
2. **"Add New → Project"** でリポジトリをインポート
3. Framework Preset: **"Vite"** → 自動検出されない場合は以下を手動設定
   - Build Command: `cd app && npm install && npm run build`
   - Output Directory: `app/dist`
4. **"Deploy"** をクリック → 自動でビルド＆デプロイ
5. URLは `https://choco-tube-plus.vercel.app` のような形式

**CLI でデプロイする場合**:
```bash
npm install -g vercel
vercel login
vercel --prod
```

**動作する機能**:
- ✅ 検索・トレンド・チャンネルページ
- ✅ 動画情報の取得
- ✅ `/whats` `/choco-chat-new` エンドポイント
- ⚠️ SSE（リアルタイムストリーム取得）はタイムアウトが発生する場合あり
- ⚠️ 動画ストリーム再生は制限される可能性あり

---

### CodeSandbox（開発・プレビュー用）

**ファイル**: `.codesandbox/tasks.json`（すでに作成済み）

> CodeSandbox は主に開発・デモ用途向けです。本番公開には他のサービスを推奨します。

**GitHub リポジトリから開く場合**:
1. `https://codesandbox.io/p/github/あなたのユーザー名/choco-tube-plus` にアクセス
2. 自動でフォークしてエディタが開く
3. `.codesandbox/tasks.json` に基づいてバックエンド（port 3001）とフロントエンド（port 5000）が起動

**手動でインポートする場合**:
1. [codesandbox.io](https://codesandbox.io) にサインアップ
2. **"Import from GitHub"** を選択
3. リポジトリURLを貼り付けてインポート
4. 左パネルの **"Tasks"** から各タスクを実行

**起動タスク**（自動実行）:
| タスク名 | コマンド |
|---|---|
| Install dependencies | `cd app && npm install && cd ../server && npm install` |
| Start backend | `cd server && node server.js` |
| Start frontend (dev) | `cd app && npm run dev` |

---

## よくある問題

| 問題 | 原因 | 解決策 |
|---|---|---|
| `app/dist` が見つからない | ビルドが未実行 | `cd app && npm run build` を実行 |
| ポートが使用中 | 他のプロセスが使用 | `PORT=8080 node server.js` で変更 |
| `node_modules` エラー | 依存パッケージ未インストール | `npm install` を実行 |
| 画像が表示されない | CORS設定 | サーバーのCORSが有効か確認 |

---

## 環境変数（オプション）

| 変数名 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3001` | サーバーのポート番号 |
