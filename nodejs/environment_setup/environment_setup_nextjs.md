# 新規プロジェクト 環境構築ガイド

> このファイルは、**新しいプロジェクトを開始するときに AI エージェントへ渡す資料**です。
> `diary-task`(日次タスク管理 PoC)で確立した「Docker + devcontainer」環境を、
> ほぼそのまま再現しつつ、各ツールのバージョンだけを最新安定版へ更新することを目的とします。

---

## 0. この資料の使い方(エージェントへの前提指示)

あなた(エージェント)は、この資料を元に新規プロジェクトの開発環境を構築します。次の原則を必ず守ってください。

1. **ホストには Docker / Docker Compose 以外を一切インストールしない。**
   Node.js / pnpm / その他の開発ツールはすべてコンテナ内に閉じる。開発は VSCode devcontainer か `docker compose` 経由で行う。
2. **バージョンは「現行ベースライン」をそのままコピーせず、§4 の手順で最新安定版を調べてから決める。**
   この資料に載っているバージョン番号は **2026年6月時点のベースライン**であり、参考値。構築直前に必ず再取得する。
3. **構成は 2 層に分かれている。**
   - **第1部(§2)= 環境インフラ層**: framework 非依存。**ほぼそのまま再利用する。**
   - **第2部(§3)= アプリスタック層**: 「Next.js Static Export SPA の例」。**新規プロジェクトの性質に応じて差し替える。**
4. **各設定ファイルにはコメントで "WHY"(なぜそうするか)を残す。** 落とし穴の多くはコメントが理由を説明している。安易に消さない。
5. 不明点・前提の置き換えが必要な箇所は、勝手に進めず確認を取る。

---

## 1. 環境の全体像

```
ホスト(Docker のみインストール)
└── Docker Compose
    └── app サービス(node:XX-bookworm-slim ベース)
        ├── 第1部: 環境インフラ層(framework 非依存・再利用)
        │   ├── Dockerfile        … corepack 焼き込み
        │   ├── docker-compose.yml … bind mount / named volume
        │   ├── devcontainer.json  … VSCode 接続 / 拡張 / features
        │   └── CI / Dependabot / audit / pnpm-workspace(サプライチェーン)
        └── 第2部: アプリスタック層(差し替え可能)
            └── Next.js / React / Tailwind / Biome / Vitest …
```

### 利用モード(3 つ)

| モード | 用途 | 起動方法 |
|--------|------|---------|
| **A** | VSCode で開発(推奨) | コマンドパレット → `Dev Containers: Reopen in Container` |
| **B** | コンテナを直接起動 | `docker compose up`(`pnpm install && pnpm dev` 自動実行) |
| **C** | CI/単発実行 | `docker compose run --rm app pnpm <command>` |

---

# 第1部 — 環境インフラ層(framework 非依存・必ず再利用)

この層は **新規プロジェクトでもほぼそのまま使える**。プロジェクト名(以下 `<PROJECT>`)とワークディレクトリのパス(以下 `/<PROJECT>`)だけ置換する。

## 2.1 ベースイメージと OS パッケージ

- ベースイメージ: `node:<NODE_MAJOR>-bookworm-slim`
- 必須 OS パッケージとその理由:

| パッケージ | 理由 |
|-----------|------|
| `git`, `curl`, `ca-certificates` | 基本ツール |
| `procps` | プロセス確認(`ps` 等) |

## 2.2 `docker/Dockerfile`

そのままコピーし、`<NODE_MAJOR>` と `corepack@<VER>` を §4 で決めた値に更新する。

```dockerfile
FROM node:<NODE_MAJOR>-bookworm-slim

# ユーザー名を引数で受け取る(docker-compose.yml の args から渡される)
# node:XX-bookworm-slim は既定で node ユーザー(UID 1000)を持つので、デフォルトも node にしておく
ARG APP_USER=node

# corepack の対話プロンプトを抑止(tty: true 環境で起動時にハングするのを防ぐ)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# 基本パッケージ
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# corepack を有効化(/usr/local/bin/ に pnpm シンボリックリンクを作るので root で実行)
# pnpm の具体的なバージョンは package.json の `packageManager` フィールドが唯一のソース。
# corepack は実行時にそれを参照してダウンロード・キャッシュする(初回のみ数秒)。
# Node 25 以降は corepack が本体に同梱されなくなったため、明示的にインストールしてから有効化する。
# corepack 自体もビルド再現性のためバージョンを固定する(上げるときはこの行を書き換える)。
RUN npm install -g corepack@<COREPACK_VER> && corepack enable

# 名前付き volume のマウント先を APP_USER 所有で先に作っておく
# (これをしないと Docker が volume を root 所有で初期化してしまい、
#  node ユーザーから書き込めなくなる)
RUN mkdir -p /<PROJECT>/node_modules /home/${APP_USER}/.local/share/pnpm/store \
    && chown -R ${APP_USER}:${APP_USER} /<PROJECT> /home/${APP_USER}/.local

# APP_USER に切り替え(以降はこのユーザーで実行)
USER ${APP_USER}

WORKDIR /<PROJECT>

# package.json の packageManager 由来で pnpm をイメージにキャッシュ(焼き込み)する。
# 実行時の corepack による pnpm ダウンロードを不要にし、起動を速く・
# ネットワーク非依存にするため。
# `corepack install`(バージョン無指定)は package.json の packageManager を唯一のソースとして
# 参照するため「corepack prepare で二重管理しない」制約と両立する。
COPY --chown=${APP_USER}:${APP_USER} package.json ./
RUN corepack install
```

**重要な設計ポイント(消さない理由):**

- **pnpm のバージョンは `package.json` の `packageManager` フィールドが唯一のソース。** Dockerfile に `corepack prepare pnpm@X` を書いて二重管理しない。
- **`corepack install` で pnpm をイメージに焼き込む。** 実行時のダウンロードを不要にし、起動を速く・ネットワーク非依存にする。
- **named volume のマウント先を先に `mkdir` + `chown`。** 怠ると root 所有で初期化され、`node` ユーザーから書けなくなる。

## 2.3 `docker-compose.yml`

```yaml
services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        APP_USER: node       # コンテナ内のユーザー名(Dockerfile に引数で渡す)
    working_dir: /<PROJECT>
    # 起動時に依存関係を同期してから dev サーバー起動
    # pnpm install は差分検知するので、node_modules が同期済みなら即時終了する
    command: sh -c "pnpm install && pnpm dev"
    ports:
      - "3000:3000"
    volumes:
      # ソース全体を bind(ホスト編集を即反映)
      - .:/<PROJECT>
      # node_modules はコンテナ内に隔離(ホストを汚さない、パフォーマンス)
      - app-node-modules:/<PROJECT>/node_modules
      # pnpm のグローバルストア(キャッシュ)
      - app-pnpm-store:/home/node/.local/share/pnpm/store
      - ~/.ssh:/home/node/.ssh:ro
      - ~/.gitconfig:/home/node/.gitconfig:ro
    stdin_open: true
    tty: true

volumes:
  app-node-modules:
  app-pnpm-store:
```

**落とし穴(必ず守る):**

1. **`environment:` に `NODE_ENV` を書かない。** dev 値が残ると Static Export の prerender が `<Html> should not be imported` で落ちる。`next dev`/`next build` がコマンド側で適切に設定する。

## 2.4 `.devcontainer/devcontainer.json`

```jsonc
{
  "name": "<PROJECT>",
  "dockerComposeFile": "../docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/<PROJECT>",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "remoteUser": "node",
  // compose の command(pnpm install && pnpm dev)を上書きして
  // コンテナは待機状態にし、VSCode のターミナルで pnpm dev を手動起動する流れにする
  // (compose 直接利用時は自動で dev サーバーが起動する)
  "overrideCommand": true,
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-docker",
        "oderwat.indent-rainbow",
        "streetsidesoftware.code-spell-checker",
        "christian-kohler.path-intellisense",
        "shardulm94.trailing-spaces",
        "wraith13.background-phi-colors",
        "mhutchie.git-graph",
        "GitHub.vscode-pull-request-github",
        "eamodio.gitlens",
        "GitHub.copilot",
        "github.copilot-chat",
        "heaths.vscode-guid",
        "ryanluker.vscode-coverage-gutters",
        "github.vscode-github-actions",
        "kisstkondoros.vscode-codemetrics",
        "vitest.explorer",
        "biomejs.biome",
        "bradlc.vscode-tailwindcss",
        "anthropic.claude-code"
      ],
      "settings": {
        "editor.insertSpaces": true,
        "editor.tabSize": 2,
        "files.autoSave": "afterDelay",
        "editor.defaultFormatter": "biomejs.biome",
        "editor.formatOnSave": true,
        "accessibility.signals.terminalBell": { "sound": "on" }
      }
    }
  }
}
```

- **`overrideCommand: true`**: devcontainer ではコンテナを待機状態で開き、`pnpm dev` を手動起動する(compose 直接利用時のみ自動起動)。
- **拡張機能**: `biomejs.biome` / `bradlc.vscode-tailwindcss` / `vitest.explorer` はアプリ層に応じて取捨選択してよい。`anthropic.claude-code` は必須。
- **features は SHA(digest)pin が望ましい**(§4.4 参照)。`devcontainer-lock.json` が自動生成される。

## 2.5 サプライチェーン対策 & CI

### `pnpm-workspace.yaml`

```yaml
minimumReleaseAge: 1440  # 1日以上経過したパッケージのみ許可
onlyBuiltDependencies: []  # ライフサイクル script は既定でブロック
```

- **`minimumReleaseAge`**: 公開直後の悪意あるバージョンを掴まないための時間ガード。
- **`onlyBuiltDependencies: []`**: postinstall 等のライフサイクルスクリプトを既定でブロック。必要なパッケージだけ明示的に許可する。

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    name: Lint / Type / Test / Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@<SHA> # v7.x

      - name: Setup pnpm
        uses: pnpm/action-setup@<SHA> # v6.x

      - name: Setup Node.js
        uses: actions/setup-node@<SHA> # v6.x
        with:
          node-version: <NODE_LTS_MAJOR>   # CI は LTS を使う(§4 の注記参照)
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Biome check
        run: pnpm check:ci

      - name: Type check
        run: pnpm type-check

      - name: Test
        run: pnpm test

      - name: Build (Static Export)
        run: pnpm build
```

> **CI と開発コンテナで Node メジャーが異なってよい。**
> diary-task では開発コンテナは Current 系(例: Node 26)、CI は Active LTS(例: Node 24)を使っている。
> アプリの実行ターゲットに合わせるなら CI は LTS が無難。両者を揃えたい場合は §4 の方針で統一する。

### `.github/workflows/audit.yml`

```yaml
name: Audit

on:
  schedule:
    - cron: "0 0 * * 1"   # 毎週月曜 09:00 JST (00:00 UTC)
  workflow_dispatch:

jobs:
  audit:
    name: pnpm audit / npm audit signatures
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@<SHA> # v7.x
      - name: Setup pnpm
        uses: pnpm/action-setup@<SHA> # v6.x
      - name: Setup Node.js
        uses: actions/setup-node@<SHA> # v6.x
        with:
          node-version: <NODE_LTS_MAJOR>
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      # moderate 以下の advisory はログ表示のみ。上流(transitive dep)で解消できないものへの
      # 過剰反応を避けるため job は fail させない。重大度を見直すときは --audit-level を上下させる。
      - name: pnpm audit
        run: pnpm audit --audit-level high
      - name: npm audit signatures
        run: npm audit signatures
```

### `.github/dependabot.yml`

npm / github-actions / docker の 3 エコシステムを毎週月曜に更新。`cooldown` で公開直後を避ける。

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Tokyo }
    cooldown: { default-days: 7 }
    open-pull-requests-limit: 5
    labels: [dependencies]
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Tokyo }
    cooldown: { default-days: 7 }
    labels: [dependencies, github-actions]
  - package-ecosystem: docker
    directory: /docker
    schedule: { interval: weekly, day: monday, time: "09:00", timezone: Asia/Tokyo }
    cooldown: { default-days: 7 }
    labels: [dependencies, docker]
```

## 2.6 Lint / Format / Test ツール(framework 非依存の方針)

- **Biome**(ESLint/Prettier 不使用)。`pnpm check` / `check:fix` / `check:ci`(`--error-on-warnings`)。
  - 規約: indent 2 / lineWidth 100 / double quotes / trailing commas all / semicolons always。
  - 複雑度ガード: 認知的複雑度 15・関数 80 行を warn(テストは override で 300 行に緩和)。
- **Vitest**(+ React Testing Library)。純粋関数はテストファースト。
  - **プロパティベーステストが効くロジックには `fast-check` を積極採用。**
  - テストファイルは対象と同じディレクトリに配置(`foo.ts` の隣に `foo.test.ts`)。

設定ファイル全文は §3 のアプリ層(jsdom 等 React 前提の部分)に含めるが、Biome 自体は framework 非依存。

---

# 第2部 — アプリスタック層(例: Next.js Static Export SPA)

> **ここは「diary-task が Next.js SPA だった場合の例」**。新規プロジェクトが別 framework(API サーバー、CLI、別フロント等)なら、
> このセクションを丸ごと差し替える。**第1部のインフラ層は据え置きでよい。**

## 3.1 `package.json`(雛形)

`packageManager` フィールドが pnpm バージョンの唯一のソース(§2.2 と対応)。バージョンは §4 で最新化する。

```jsonc
{
  "name": "<PROJECT>",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@<PNPM_VER>",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "biome": "biome",
    "check": "biome check",
    "check:ci": "biome check --error-on-warnings",
    "check:fix": "biome check --write",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  },
  "dependencies": {
    "next": "<NEXT_VER>",
    "react": "<REACT_VER>",
    "react-dom": "<REACT_VER>"
    // 必要に応じて: zod, uuidv7, yaml, @dnd-kit/core 等
  },
  "devDependencies": {
    "@biomejs/biome": "<BIOME_VER>",
    "@tailwindcss/postcss": "<TAILWIND_VER>",
    "tailwindcss": "<TAILWIND_VER>",
    "typescript": "<TS_VER>",
    "@types/node": "<TYPES_NODE_VER>",
    "@types/react": "<TYPES_REACT_VER>",
    "@types/react-dom": "<TYPES_REACT_VER>",
    "vitest": "<VITEST_VER>",
    "@vitest/ui": "<VITEST_VER>",
    "@vitejs/plugin-react": "<PLUGIN_REACT_VER>",
    "@testing-library/react": "<...>",
    "@testing-library/dom": "<...>",
    "@testing-library/jest-dom": "<...>",
    "@testing-library/user-event": "<...>",
    "jsdom": "<...>",
    "fast-check": "<FASTCHECK_VER>"
  }
}
```

## 3.2 `next.config.ts`(Static Export)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true, // Static Export では Image Optimization が使えない
  },
  reactStrictMode: true,
};

export default nextConfig;
```

## 3.3 `tsconfig.json`

`strict: true` / パスエイリアス `@/*` → `./src/*`。

```jsonc
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"],
  "exclude": ["node_modules"]
}
```

## 3.4 `postcss.config.mjs` / Tailwind v4

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## 3.5 `vitest.config.ts` / `vitest.setup.ts`

```typescript
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
  },
});
```

## 3.6 `biome.json`

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/<BIOME_VER>/schema.json",
  "files": {
    "includes": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx", "src/**/*.json",
                 "vitest.config.ts", "vitest.setup.ts", "next.config.ts"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": { "level": "warn", "options": { "maxAllowedComplexity": 15 } },
        "noExcessiveLinesPerFunction": { "level": "warn", "options": { "maxLines": 80 } }
      }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" } },
  "overrides": [
    {
      "includes": ["**/*.test.ts", "**/*.test.tsx"],
      "linter": { "rules": { "complexity": { "noExcessiveLinesPerFunction": { "level": "warn", "options": { "maxLines": 300 } } } } }
    }
  ]
}
```

> `$schema` の URL に Biome のバージョンが含まれる。Biome を上げたらここも更新する。

### 別 framework に差し替える際に触る箇所(チェックリスト)

- [ ] `package.json` の `dependencies` / `scripts`(`dev` / `build` / `start`)
- [ ] `next.config.ts` / `postcss.config.mjs` / Tailwind(フロントでなければ不要)
- [ ] `tsconfig.json` の `jsx` / `plugins`(Next 非依存なら削除)
- [ ] `vitest.config.ts` の `environment`(Node 系なら `node`、`jsdom` 不要)
- [ ] `biome.json` の `files.includes`
- [ ] CI の `Build` ステップ(Static Export 以外なら変更)
- [ ] ポート番号(`docker-compose.yml` の `ports` と dev サーバー)

---

## 4. バージョン最新化の手順

> **この資料のバージョン番号(§4.5 のベースライン表)は 2026年6月時点の参考値。** 構築直前に必ず再取得すること。

### 4.1 npm パッケージの最新安定版

ホストに Node を入れない方針なので、調査もコンテナ経由か、registry 直参照で行う。

```bash
# コンテナ内 / CI で(npm registry の latest タグ)
npm view <pkg> version

# 例
npm view pnpm version
npm view next version
npm view @biomejs/biome version
npm view typescript version
```

ネットワーク制限環境では registry を直接参照:
`https://registry.npmjs.org/<pkg>/latest` の `version` フィールドを見る。

### 4.2 Node.js のバージョン選定

- **開発コンテナ(Dockerfile の `FROM`)**: 最新の安定系を使ってよい(diary-task は Current 系)。
- **CI / 実行ターゲット**: **Active LTS** を推奨。
- LTS の確認: `https://nodejs.org/en/about/previous-releases`(スケジュール)/ `https://nodejs.org/dist/index.json`(全リリース)。
- 開発と CI で Node メジャーを揃えるか分けるかは、プロジェクトの実行ターゲットに合わせて決める(§2.5 の注記)。
- **Node 25 以降は corepack が本体同梱でない** → Dockerfile で `npm install -g corepack@<VER>` が必要(§2.2)。

### 4.3 corepack のバージョン

```bash
npm view corepack version
```

Dockerfile の `corepack@<VER>` を更新。ビルド再現性のため固定する(範囲指定にしない)。

### 4.4 GitHub Actions の SHA pin

タグはミュータブルなので、サプライチェーン保護のため **コミット SHA で固定**し、行末にタグをコメントする。

```bash
# 最新タグの確認(リリースページ)
#   https://github.com/actions/checkout/releases
#   https://github.com/actions/setup-node/releases
#   https://github.com/pnpm/action-setup/releases

# タグ → コミット SHA(最も確実)
git ls-remote https://github.com/actions/checkout v7.0.0

# または gh CLI(軽量タグの場合)
gh api repos/actions/checkout/git/refs/tags/v7.0.0 --jq '.object.sha'
```

ワークフローには `uses: actions/checkout@<40桁SHA> # v7.0.0` の形で書く。
以後は Dependabot(`github-actions`)が SHA pin のまま更新 PR を出す。

### 4.5 devcontainer features の更新

features は OCI イメージ(ghcr.io)。`:1`(メジャー)固定でも動くが、digest pin が望ましい。

```bash
# 最新一覧
#   https://containers.dev/features
# digest 取得
docker buildx imagetools inspect ghcr.io/devcontainers/features/github-cli:1
```

`devcontainer-lock.json` が VSCode 接続時に自動生成・更新される。

### 4.6 参考ベースライン(2026年6月時点)

> **そのままコピーせず、必ず §4.1〜4.5 で再取得した値で上書きすること。**
> 左列 = diary-task の現行値、右列 = 調査時点の最新安定版(参考)。差分があるものはメジャー/マイナー差に注意。

| コンポーネント | diary-task 現行 | 2026-06 時点 最新(参考) | 備考 |
|---------------|----------------|--------------------------|------|
| Node.js(開発コンテナ) | 26(`node:26-bookworm-slim`) | Current: 26.x / **Active LTS: 24.x** | 開発は Current、CI は LTS 採用中 |
| Node.js(CI) | 24 | LTS 24.x | 実行ターゲットに合わせる |
| pnpm | 10.30.0 | **11.8.0** | メジャー更新あり。lockfile 互換に注意 |
| corepack | 0.35.0 | 0.35.0 | Dockerfile で固定 |
| Next.js | 16.2.9 | 16.2.9 | |
| React / react-dom | 19.2.7 | 19.2.7 | |
| Tailwind CSS / @tailwindcss/postcss | v4 系 | **4.3.1** | v4 系 |
| Biome | 2.4.16 | **2.5.0** | `biome.json` の `$schema` URL も更新 |
| Vitest / @vitest/ui | 4.1.5 | **4.1.9** | |
| TypeScript | ^6 | **6.0.3** | 5系→6系のメジャー差に注意 |
| @types/node | ^25 | — | Node メジャーに追随 |
| zod | ^4.4.3 | 4.4.3 | アプリ層・必要時 |
| fast-check | ^4.8.0 | 4.8.0 | PBT 用 |
| actions/checkout | v6.0.3 | **v7.0.0** | SHA pin(§4.4) |
| actions/setup-node | v6.4.0 | v6.4.0 | SHA pin |
| pnpm/action-setup | v6 | v6.0.9 | SHA pin |
| devcontainer features (git / github-cli) | `:1` / 1.1.0 | `:1` / 1.1.0 | digest pin 推奨 |

---

## 5. セットアップ手順(チェックリスト)

新規プロジェクトで上から順に実行する。

1. [ ] リポジトリ作成。`<PROJECT>` 名と `/<PROJECT>` パスを決める。
2. [ ] §4 で各ツールの最新安定版を調べ、採用バージョンを確定する。
3. [ ] **第1部のファイルを配置**(`<PROJECT>` / `<NODE_MAJOR>` / `<COREPACK_VER>` を置換):
   - [ ] `docker/Dockerfile`
   - [ ] `docker-compose.yml`
   - [ ] `.devcontainer/devcontainer.json`
   - [ ] `pnpm-workspace.yaml`
   - [ ] `.github/workflows/ci.yml`、`.github/workflows/audit.yml`、`.github/dependabot.yml`
4. [ ] **第2部のファイルを配置 or 差し替え**(アプリ層): `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `vitest.config.ts` / `vitest.setup.ts` / `biome.json`
5. [ ] GitHub Actions を SHA pin に更新(§4.4)。
6. [ ] 初回ビルド&起動: `docker compose up -d --build` → `http://localhost:3000` を確認。
   - VSCode 派は `Dev Containers: Reopen in Container` →(必要なら)`pnpm dev`。
7. [ ] 動作確認: `docker compose run --rm app pnpm check:ci` / `pnpm type-check` / `pnpm test` / `pnpm build` が通る。
8. [ ] `README.md` と `CLAUDE.md` をプロジェクトに合わせて作成(本ガイドの内容を要約)。
9. [ ] **PR は必ず Draft で作成**(運用ルール)。新規ブランチに upstream は設定しない。

---

## 6. 既知の落とし穴(まとめ)

| # | 症状 | 原因 / 対処 |
|---|------|------------|
| 1 | `pnpm build` で `<Html> should not be imported` | `docker-compose.yml` の `environment:` に `NODE_ENV` を設定している。**削除**する。 |
| 2 | bind mount したソースが root 所有で書けない | ホスト/コンテナの UID 不一致。ホスト側は `sudo chown -R "$(id -u):$(id -g)" .`、コンテナ内は `docker compose exec -u root app chown -R node:node /<PROJECT>`(Docker の権限で root exec)。 |
| 3 | named volume が root 所有で初期化され書けない | Dockerfile で `mkdir` + `chown` を先に行う(§2.2)。 |
| 4 | corepack 起動時にハング | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` を消さない(`tty: true` 環境)。 |
| 5 | ベースイメージが落とせない | `FROM` を一時的に `node:<NODE_MAJOR>-slim` や `node:lts-bookworm-slim` に置換して再ビルド。 |
| 6 | pnpm のバージョンを変えたい | Dockerfile ではなく **`package.json` の `packageManager`** を書き換えて再ビルド(唯一のソース)。 |

---

## 7. 運用ルール(リマインド)

- ホストには Docker 以外入れない。すべてコンテナ内。
- 新規ブランチに upstream は(指示なき限り)設定しない。
- 意味のある単位で定期的にコミットする。
- **PR は必ず Draft PR で作成。**
- コメント・コミットメッセージ・ドキュメントは日本語。
- 設計は分割統治・SOLID。PBT が効くロジックは `fast-check` を採用。

---

*このガイドは diary-task の環境構成(2026年6月時点)を基に作成。バージョンは §4 の手順で都度最新化すること。*
