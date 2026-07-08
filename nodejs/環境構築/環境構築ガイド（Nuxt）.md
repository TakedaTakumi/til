# Nuxt 新規プロジェクト 環境構築ガイド

> このファイルは、**Nuxt 3 の新規プロジェクトを開始するときに AI エージェントへ渡す資料**です。
> diary-task(日次タスク管理 PoC)で確立した「Docker + devcontainer + Claude Code サンドボックス」環境を Nuxt 向けに再構成したもので、
> **この1ファイルだけで環境構築が完結する**ように書かれています(元の汎用ガイドへの参照は不要)。

---

## 0. この資料の使い方(エージェントへの前提指示)

あなた(エージェント)は、この資料を元に新規プロジェクトの開発環境を構築します。次の原則を必ず守ってください。

1. **ホストには Docker / Docker Compose 以外を一切インストールしない。**
   Node.js / pnpm / その他の開発ツールはすべてコンテナ内に閉じる。開発は VSCode devcontainer か `docker compose` 経由で行う。
2. **バージョンは本資料の数値をそのままコピーせず、§4 の手順で最新安定版を調べてから決める。**
   本資料に載っているバージョン番号は **2026年7月時点のベースライン**であり、参考値。構築直前に必ず再取得する。
3. **構成は 2 層に分かれている。**
   - **第1部(§2)= 環境インフラ層**: framework 非依存。プロジェクト名の置換以外はそのまま使う。
   - **第2部(§3)= アプリスタック層**: Nuxt 3 用。
4. **各設定ファイルにはコメントで "WHY"(なぜそうするか)を残す。** 落とし穴の多くはコメントが理由を説明している。安易に消さない。
5. 不明点・前提の置き換えが必要な箇所は、勝手に進めず確認を取る。

### 本ガイドの決定事項(Nuxt 固有)

- **Nuxt 3 最新(3.x) + `future.compatibilityVersion: 4`** で `app/` ディレクトリ構成を採用する(4.x にはしない)。
- **Lint + Formatter は `@nuxt/eslint` 一本 + ESLint Stylistic**(Prettier / Biome 不使用)。
  - 選定経緯: Biome が第一候補だったが、Vue SFC の `<template>` 対応が実験フラグ
    (`html.experimentalFullSupportEnabled`)配下で、unused 誤検知・v2.4 系の回帰バグがあり、
    安定化時期も公式に確約されていないため見送り(2026-07 時点)。
    `@nuxt/eslint` はプラグイン依存をモジュール側が自動生成・自動追従するため、
    「ESLint プラグイン地獄の回避」という動機を単一モジュールで満たせる。
  - **Biome 再評価トリガー**: 実験フラグ廃止 + HTML/Vue サポートの stable 宣言 + Vue ルールの nursery 卒業。
- 整形規約: **indent 2 / lineWidth 100 / double quotes / semicolons always / trailing commas(multiline)**。
- 複雑度ガード: **認知的複雑度 15(sonarjs)・関数 80 行を warn**(テストは 300 行に緩和)。CI は `--max-warnings=0` で厳格運用。
- テスト: **Vitest + @nuxt/test-utils + fast-check**。テストファイルは対象と同じディレクトリに併置(`foo.ts` の隣に `foo.test.ts`)。

---

## 1. 環境の全体像

```
ホスト(Docker のみインストール)
└── Docker Compose
    └── app サービス(node:XX-bookworm-slim ベース)
        ├── 第1部: 環境インフラ層(framework 非依存)
        │   ├── Dockerfile        … corepack 焼き込み / Claude Code / bubblewrap
        │   ├── docker-compose.yml … bind mount / named volume / seccomp
        │   ├── devcontainer.json  … VSCode 接続 / 拡張 / features
        │   ├── .claude/settings.json … サンドボックス & 権限
        │   └── CI / Dependabot / audit / pnpm-workspace(サプライチェーン)
        └── 第2部: アプリスタック層(Nuxt 3)
            └── Nuxt / Vue / @nuxt/eslint / Vitest / fast-check …
```

### 利用モード(3 つ)

| モード | 用途 | 起動方法 |
|--------|------|---------|
| **A** | VSCode で開発(推奨) | コマンドパレット → `Dev Containers: Reopen in Container` |
| **B** | コンテナを直接起動 | `docker compose up`(`pnpm install && pnpm dev` 自動実行) |
| **C** | CI/単発実行 | `docker compose run --rm app pnpm <command>` |

---

# 第1部 — 環境インフラ層(framework 非依存)

プロジェクト名(以下 `<PROJECT>`)とワークディレクトリのパス(以下 `/<PROJECT>`)だけ置換する。

## 2.1 ベースイメージと OS パッケージ

- ベースイメージ: `node:<NODE_MAJOR>-bookworm-slim`
- 必須 OS パッケージとその理由:

| パッケージ | 理由 |
|-----------|------|
| `git`, `curl`, `ca-certificates` | 基本ツール |
| `sudo` | コンテナ内での権限調整(NOPASSWD) |
| `procps` | プロセス確認(`ps` 等) |
| **`bubblewrap`** | **Claude Code のサンドボックス(Bash 隔離)に必須。** FS/プロセス隔離を担う。無いと Bash 実行が全滅。 |
| **`socat`** | **同上。** サンドボックスのネットワークリレー。 |

## 2.2 `docker/Dockerfile`

`<NODE_MAJOR>` と `corepack@<COREPACK_VER>` を §4 で決めた値に更新する。

```dockerfile
FROM node:<NODE_MAJOR>-bookworm-slim

# ユーザー名を引数で受け取る(docker-compose.yml の args から渡される)
# node:XX-bookworm-slim は既定で node ユーザー(UID 1000)を持つので、デフォルトも node にしておく
ARG APP_USER=node

# corepack の対話プロンプトを抑止(tty: true 環境で起動時にハングするのを防ぐ)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# corepack のキャッシュ/ダウンロード先を allowWrite 対象配下に固定する。
# 既定の ~/.cache/node/corepack は sandbox の allowWrite に含まれず、
# corepack の書込が EROFS で失敗して pnpm が全滅するため。
# ~/.local/share/pnpm/** は .claude/settings.json の allowWrite 対象なので書込可能。
ENV COREPACK_HOME=/home/${APP_USER}/.local/share/pnpm/corepack

# 基本パッケージ
# bubblewrap / socat は Claude Code の sandbox(bash 隔離)に必須。
# bubblewrap: ファイルシステム/プロセス隔離、socat: ネットワークリレー。
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    sudo \
    procps \
    bubblewrap \
    socat \
    && rm -rf /var/lib/apt/lists/*

# APP_USER に sudo 権限を付与(権限調整用、NOPASSWD)
RUN echo "${APP_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

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

# Claude Code をグローバルインストール(APP_USER 権限)
RUN npm config set prefix "/home/${APP_USER}/.npm-global"
ENV PATH=/home/${APP_USER}/.npm-global/bin:$PATH
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /<PROJECT>

# package.json の packageManager 由来で pnpm をイメージにキャッシュ(焼き込み)する。
# sandbox 下では registry 到達不可で corepack が pnpm を DL できず `pnpm install` が
# 起動前に失敗する。ビルドは sandbox 外=registry 到達可なのでここで焼いておけば
# 実行時(sandbox 下)は DL 不要。
# `corepack install`(バージョン無指定)は package.json の packageManager を唯一のソースとして
# 参照するため「corepack prepare で二重管理しない」制約と両立する。
# COREPACK_HOME(~/.local/share/pnpm/corepack)は named volume 対象外(store のみ volume)
# なので、焼いたキャッシュは実行時もイメージ層として残る。
COPY --chown=${APP_USER}:${APP_USER} package.json ./
RUN corepack install
```

**重要な設計ポイント(消さない理由):**

- **pnpm のバージョンは `package.json` の `packageManager` フィールドが唯一のソース。** Dockerfile に `corepack prepare pnpm@X` を書いて二重管理しない。
- **`corepack install` で pnpm をイメージに焼き込む。** サンドボックス実行時は registry に届かないため、ビルド時(=サンドボックス外)にキャッシュしておくのが肝。
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
      - "3000:3000"          # Nuxt dev サーバーの既定ポート
    volumes:
      # ソース全体を bind(ホスト編集を即反映)
      - .:/<PROJECT>
      # node_modules はコンテナ内に隔離(ホストを汚さない、パフォーマンス)
      - app-node-modules:/<PROJECT>/node_modules
      # pnpm のグローバルストア(キャッシュ)
      - app-pnpm-store:/home/node/.local/share/pnpm/store
      # Claude の設定・認証・履歴はホストと共有
      # $HOME が未定義だとマウント先が不定になるため、明示的にエラーにする
      - ${HOME:?HOME環境変数が未定義です。ホストの$HOMEが設定されている必要があります}/.claude:/home/node/.claude
      - ~/.ssh:/home/node/.ssh:ro
      - ~/.gitconfig:/home/node/.gitconfig:ro
    environment:
      # NODE_ENV はコマンド側(nuxi dev / nuxi build)が自動で設定するため
      # ここで強制すると build 時に dev 値が残って挙動が乱れるので設定しない
      CLAUDE_CONFIG_DIR: /home/node/.claude
    # VSCode devcontainer から attach するときに強制停止されないようにする
    security_opt:
      # Claude Code のサンドボックス (bubblewrap) が unprivileged user namespace の
      # 作成を必要とするため、seccomp フィルタを無効化する。
      # 外すと Claude Code の Bash 実行が全滅する（bwrap が namespace を作れない）。
      # NOTE: seccomp 完全無効化は攻撃面を広げるため、この compose は開発専用。
      #       本番運用する場合は override ファイルでこの設定を打ち消すこと
      #       (主隔離境界はコンテナであり、本設定は多層防御の一層を緩めるもの)。
      - seccomp=unconfined
    stdin_open: true
    tty: true

volumes:
  app-node-modules:
  app-pnpm-store:
```

**落とし穴(必ず守る):**

1. **`environment:` に `NODE_ENV` を書かない。** `nuxi dev` / `nuxi build` がコマンド側で適切に設定する。強制すると build 時に dev 値が残って挙動が乱れる。
2. **`seccomp=unconfined` は Claude Code サンドボックス(bubblewrap の user namespace)に必須。** ただし攻撃面を広げるため **この compose は開発専用**。本番では override で打ち消す。
3. **`${HOME:?...}` 構文で HOME 未定義を即エラーにする。** マウント先が不定になる事故を防ぐ。
4. **`~/.claude` はホスト bind mount。** 認証・履歴がコンテナ再ビルドでも残る。初回は `mkdir -p ~/.claude` が必要(root 所有での自動作成を回避)。

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
        "Vue.volar",               // Vue 公式言語サポート(SFC の型・補完)
        "dbaeumer.vscode-eslint",  // ESLint(lint + format を一本化)
        "anthropic.claude-code"
      ],
      "settings": {
        "editor.insertSpaces": true,
        "editor.tabSize": 2,
        "files.autoSave": "afterDelay",
        // 整形は ESLint(Stylistic)の auto-fix に一本化する。
        // formatOnSave + 別 formatter の併用は二重整形・競合の温床になるため、
        // 保存時アクションは source.fixAll.eslint のみとする。
        "editor.formatOnSave": false,
        "editor.codeActionsOnSave": {
          "source.fixAll.eslint": "explicit"
        },
        "eslint.format.enable": true,
        "claudeCode.allowDangerouslySkipPermissions": true,
        "accessibility.signals.terminalBell": { "sound": "on" }
      }
    }
  }
}
```

- **`overrideCommand: true`**: devcontainer ではコンテナを待機状態で開き、`pnpm dev` を手動起動する(compose 直接利用時のみ自動起動)。
- **拡張機能**: `Vue.volar` / `dbaeumer.vscode-eslint` / `vitest.explorer` が Nuxt 開発の中核。`anthropic.claude-code` は必須。
- **features は SHA(digest)pin が望ましい**(§4.5 参照)。`devcontainer-lock.json` が自動生成される。

## 2.5 Claude Code サンドボックス設定 `.claude/settings.json`

> このファイルは **コミット対象**。サンドボックスと権限の deny/ask ルールを定義する。変更時は影響に注意。

```jsonc
{
  "allowManagedPermissionRulesOnly": true,
  "permissions": {
    "allow": ["Read", "Grep", "Glob"],
    "deny": [
      "Bash(rm -rf ~/*)",
      "Bash(curl*)",
      "Bash(wget *)",
      "Bash(git push *)",
      "Bash(chmod 777 *)",
      "Bash(sudo *)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/.envrc)",
      "Read(**/.secrets/**)",
      "Read(**/.credentials.json)",
      "Read(**.*.pem)",
      "Read(**.*.key)"
    ],
    "ask": [
      "Bash(gh api -X POST *)",
      "Bash(gh api --method POST *)",
      "Bash(gh pr comment *)",
      "Bash(gh pr review *)",
      "Bash(gh issue comment *)"
    ]
  },
  "sandbox": {
    "enabled": true,
    "enableWeakerNestedSandbox": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "denyRead": [
        "~/.ssh/**",
        "~/.aws/**",
        "~/.claude/**",
        "**/.env",
        "**/.env.*",
        "**/.envrc",
        "**/.secrets/**",
        "**/.credentials.json",
        "**/*.pem",
        "**/*.key"
      ],
      "allowWrite": [
        "/tmp/**",
        "./**",
        "~/.local/share/pnpm/**"
      ]
    },
    "allowedDomains": [
      "registry.npmjs.org",
      "github.com",
      "*.githubusercontent.com"
    ]
  }
}
```

**ポイント:**

- **`allowWrite` に `~/.local/share/pnpm/**` が含まれる** → Dockerfile の `COREPACK_HOME` をここに置く理由(§2.2)と対応。
- **`allowedDomains`** は pnpm install と GitHub 操作に必要な最小ドメイン。Nuxt 標準構成では追加不要。
- **`denyRead` / `deny`** は秘密情報の読み出しと破壊的操作をブロック。プロジェクト固有の秘密ファイルパターンがあれば追記する。

## 2.6 サプライチェーン対策 & CI

### `pnpm-workspace.yaml`

```yaml
minimumReleaseAge: 1440  # 1日以上経過したパッケージのみ許可
# ライフサイクル script は既定でブロック。
# Nuxt では esbuild 等がビルドスクリプトを必要とするため、
# `pnpm install` 時の「Ignored build scripts」警告に出たパッケージだけを
# 確認の上でここに明示追加する(既定ブロックの方針は崩さない)。
onlyBuiltDependencies: []
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
        # postinstall(nuxi prepare)がここで走り、.nuxt/eslint.config.mjs と型が生成される

      - name: Lint (ESLint, max-warnings=0)
        run: pnpm check:ci

      - name: Type check
        run: pnpm type-check

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build   # nuxt build
```

> **CI と開発コンテナで Node メジャーが異なってよい。**
> 開発コンテナは Current 系、CI は Active LTS を使う方針。
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

---

# 第2部 — アプリスタック層(Nuxt 3)

## 3.1 `package.json`(雛形)

`packageManager` フィールドが pnpm バージョンの唯一のソース(§2.2 と対応)。

```jsonc
{
  "name": "<PROJECT>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@<PNPM_VER>",
  "scripts": {
    "dev": "nuxi dev",
    "build": "nuxi build",
    "preview": "nuxi preview",
    // .nuxt/ の型・eslint 設定の生成。install 直後に必ず走らせる(§6 落とし穴 #12)
    "postinstall": "nuxi prepare",
    "check": "eslint .",
    "check:ci": "eslint . --max-warnings=0",
    "check:fix": "eslint . --fix",
    "type-check": "nuxi typecheck",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "nuxt": "<NUXT_VER>",
    "vue": "<VUE_VER>",
    "vue-router": "<VUE_ROUTER_VER>"
  },
  "devDependencies": {
    "@nuxt/eslint": "<NUXT_ESLINT_VER>",
    "eslint": "<ESLINT_VER>",
    "eslint-plugin-sonarjs": "<SONARJS_VER>",
    "@nuxt/test-utils": "<NUXT_TEST_UTILS_VER>",
    "@vue/test-utils": "<VUE_TEST_UTILS_VER>",
    "vitest": "<VITEST_VER>",
    "happy-dom": "<HAPPY_DOM_VER>",
    "fast-check": "<FASTCHECK_VER>",
    "typescript": "<TS_VER>",
    "vue-tsc": "<VUE_TSC_VER>"
  }
}
```

> - `eslint-plugin-sonarjs` は認知的複雑度 15 の warn のためだけに入れる**唯一の追加プラグイン**。
>   依存を増やしたくない場合は ESLint core の `complexity`(循環的複雑度)で代替可。
> - `vue-tsc` は `nuxi typecheck` の実行に必要。

## 3.2 `nuxt.config.ts`

```typescript
export default defineNuxtConfig({
  // Nuxt 3 のまま app/ ディレクトリ構成(Nuxt 4 スタイル)を使う。
  // アーキテクチャメモのディレクトリ例(app/pages, app/features, ...)と一致させるため。
  future: { compatibilityVersion: 4 },

  modules: ["@nuxt/eslint"],

  eslint: {
    config: {
      // ESLint Stylistic で整形まで一本化(Prettier 不使用)。
      // 規約: indent 2 / double quotes / semi always / trailing commas(multiline)
      stylistic: {
        indent: 2,
        quotes: "double",
        semi: true,
        commaDangle: "always-multiline",
      },
    },
  },

  // 自作コードの自動 import を無効化(アーキテクチャ規約: 明示 import)。
  // 依存関係を grep と定義ジャンプで追跡可能に保つため。
  imports: { dirs: [] },
  components: { dirs: [] },

  typescript: {
    strict: true,
  },
});
```

## 3.3 `tsconfig.json`

Nuxt が `nuxi prepare` で生成する設定を継承する(パスエイリアス `~` `@` や生成型は Nuxt 管理)。

```jsonc
{
  "extends": "./.nuxt/tsconfig.json"
}
```

> WHY: Nuxt はビルド設定と連動した tsconfig を `.nuxt/` に生成する。手書きで重複させると
> Nuxt 側の変更に追従できなくなるため、strict 等の指定は `nuxt.config.ts` の `typescript` に寄せる。

## 3.4 `eslint.config.mjs`

`@nuxt/eslint` がプロジェクト構造に応じて `.nuxt/eslint.config.mjs` を自動生成する。
それを `withNuxt()` で拡張するだけで、eslint-plugin-vue / typescript-eslint 等の
プラグイン管理はモジュール側が吸収する(個別プラグインを import しない)。

```javascript
// @ts-check
import sonarjs from "eslint-plugin-sonarjs";
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // 複雑度ガード: 認知的複雑度 15 / 関数 80 行を warn
  {
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 15],
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  // テストは関数長を 300 行に緩和
  {
    files: ["**/*.test.ts"],
    rules: {
      "max-lines-per-function": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
);
```

> - CI は `pnpm check:ci`(= `eslint . --max-warnings=0`)。warn も落とす厳格運用。
> - 実効ルールの確認は Nuxt DevTools の ESLint Config Inspector で可視化できる。

## 3.5 `vitest.config.ts`

```typescript
import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    // ドメインロジック(純粋関数)中心は happy-dom で十分高速。
    // Nuxt ランタイム(useAsyncData 等)が必要なテストはファイル先頭の
    // `// @vitest-environment nuxt` でテスト単位に切り替える。
    environment: "happy-dom",
    globals: false,
  },
});
```

> テストファイルは対象と同じディレクトリに併置する。
> 例: `app/features/order/domain/orderTotal.ts` の隣に `orderTotal.test.ts`。
> プロパティベーステストが効くロジック(合計計算・状態遷移の不変条件等)は `fast-check` を使う。

## 3.6 `.gitignore`

```gitignore
node_modules
.nuxt
.output
dist
.env
.env.*
```

---

## 4. バージョン最新化の手順

> **本資料のバージョン番号(§4.6 のベースライン表)は 2026年7月時点の参考値。** 構築直前に必ず再取得すること。

### 4.1 npm パッケージの最新安定版

ホストに Node を入れない方針なので、調査もコンテナ経由か、registry 直参照で行う。

```bash
# コンテナ内 / CI で(npm registry の latest タグ)
npm view <pkg> version

# 例
npm view pnpm version
npm view nuxt versions      # 3.x 系の最新を選ぶ(4.x にしない)
npm view @nuxt/eslint version
npm view typescript version
```

ネットワーク制限環境では registry を直接参照:
`https://registry.npmjs.org/<pkg>/latest` の `version` フィールドを見る。
(nuxt のように「latest ではなく特定メジャーの最新」が必要な場合は
`https://registry.npmjs.org/<pkg>` の `versions` 一覧から選ぶ。)

### 4.2 Node.js のバージョン選定

- **開発コンテナ(Dockerfile の `FROM`)**: 最新の安定系を使ってよい(Current 系)。
- **CI / 実行ターゲット**: **Active LTS** を推奨。
- LTS の確認: `https://nodejs.org/en/about/previous-releases`(スケジュール)/ `https://nodejs.org/dist/index.json`(全リリース)。
- 開発と CI で Node メジャーを揃えるか分けるかは、プロジェクトの実行ターゲットに合わせて決める(§2.6 の注記)。
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

### 4.6 参考ベースライン(2026年7月時点)

> **そのままコピーせず、必ず §4.1〜4.5 で再取得した値で上書きすること。**

| コンポーネント | 参考値(2026-07) | 備考 |
|---------------|------------------|------|
| Node.js(開発コンテナ) | Current: 26.x | `node:26-bookworm-slim` |
| Node.js(CI) | Active LTS: 24.x | 実行ターゲットに合わせる |
| pnpm | 11.x | `packageManager` で固定 |
| corepack | 0.35.x | Dockerfile で固定 |
| nuxt | 3.x 系最新(§4.1 で確定) | **4.x にしない** |
| vue / vue-router | nuxt が要求する最新 | |
| @nuxt/eslint / eslint | §4.1 で確定 | |
| eslint-plugin-sonarjs | §4.1 で確定 | **ESLint 9(flat config)対応版であることを確認** |
| @nuxt/test-utils / @vue/test-utils | §4.1 で確定 | |
| vitest / happy-dom | §4.1 で確定 | |
| fast-check | 4.x | PBT 用 |
| typescript / vue-tsc | §4.1 で確定 | |
| actions/checkout ほか | 各リリースページ | SHA pin(§4.4) |
| devcontainer features (git / github-cli) | `:1` | digest pin 推奨 |

---

## 5. セットアップ手順(チェックリスト)

新規プロジェクトで上から順に実行する。

1. [ ] リポジトリ作成。`<PROJECT>` 名と `/<PROJECT>` パスを決める。
2. [ ] §4 で各ツールの最新安定版を調べ、採用バージョンを確定する。
3. [ ] **第1部のファイルを配置**(`<PROJECT>` / `<NODE_MAJOR>` / `<COREPACK_VER>` を置換):
   - [ ] `docker/Dockerfile`
   - [ ] `docker-compose.yml`
   - [ ] `.devcontainer/devcontainer.json`
   - [ ] `.claude/settings.json`
   - [ ] `pnpm-workspace.yaml`
   - [ ] `.github/workflows/ci.yml`、`.github/workflows/audit.yml`、`.github/dependabot.yml`
4. [ ] **第2部のファイルを配置**: `package.json` / `nuxt.config.ts` / `tsconfig.json` / `eslint.config.mjs` / `vitest.config.ts` / `.gitignore`
5. [ ] GitHub Actions を SHA pin に更新(§4.4)。
6. [ ] ホストで初回準備: `mkdir -p ~/.claude`(root 所有での自動作成を回避)。
7. [ ] 初回ビルド&起動: `docker compose up -d --build` → `http://localhost:3000` を確認。
   - VSCode 派は `Dev Containers: Reopen in Container` →(必要なら)`pnpm dev`。
   - `pnpm install` 時に「Ignored build scripts」警告が出たら、§6 落とし穴 #13 に従い `onlyBuiltDependencies` を調整。
8. [ ] 動作確認: `docker compose run --rm app pnpm check:ci` / `pnpm type-check` / `pnpm test` / `pnpm build` が通る。
9. [ ] `README.md` と `CLAUDE.md` をプロジェクトに合わせて作成(本ガイドの内容を要約)。
10. [ ] **PR は必ず Draft で作成**(運用ルール)。新規ブランチに upstream は設定しない。

---

## 6. 既知の落とし穴(まとめ)

| # | 症状 | 原因 / 対処 |
|---|------|------------|
| 1 | build の挙動が dev のまま乱れる | `docker-compose.yml` の `environment:` に `NODE_ENV` を設定している。**削除**する(`nuxi dev` / `nuxi build` がコマンド側で管理)。 |
| 2 | コンテナ内で Claude Code の Bash が全滅 | `seccomp=unconfined` が無い / `bubblewrap`・`socat` 未インストール。§2.2/§2.3 を確認。 |
| 3 | `pnpm install` がサンドボックス下で失敗 | corepack が registry に届かず pnpm を DL できない。**Dockerfile の `corepack install` で焼き込み**(§2.2)。 |
| 4 | corepack の書込が EROFS で失敗 | `COREPACK_HOME` が allowWrite 外。`~/.local/share/pnpm/corepack` に固定(§2.2)。 |
| 5 | bind mount したソースが root 所有で書けない | ホスト/コンテナの UID 不一致。`sudo chown -R "$(id -u):$(id -g)" .` または `docker compose exec app sudo chown -R node:node /<PROJECT>`。 |
| 6 | `${HOME:?...}` でエラー | ホストの `HOME` 未定義。`echo $HOME` で確認し設定する。 |
| 7 | `~/.claude` が root 所有でマウント不可 | `sudo chown -R "$(id -u):$(id -g)" ~/.claude`。初回は事前 `mkdir -p ~/.claude`。 |
| 8 | named volume が root 所有で初期化され書けない | Dockerfile で `mkdir` + `chown` を先に行う(§2.2)。 |
| 9 | corepack 起動時にハング | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` を消さない(`tty: true` 環境)。 |
| 10 | ベースイメージが落とせない | `FROM` を一時的に `node:<NODE_MAJOR>-slim` や `node:lts-bookworm-slim` に置換して再ビルド。 |
| 11 | pnpm のバージョンを変えたい | Dockerfile ではなく **`package.json` の `packageManager`** を書き換えて再ビルド(唯一のソース)。 |
| 12 | `eslint .` が `.nuxt/eslint.config.mjs` が無いと言って落ちる | `nuxi prepare` 未実行。`postinstall` に設定済みなので **install を先に**。CI もステップ順を守る(§2.6)。 |
| 13 | `pnpm install` 時に「Ignored build scripts: ...」警告、または dev 起動失敗 | `pnpm-workspace.yaml` の `onlyBuiltDependencies: []` が依存のビルドスクリプトをブロック。警告に出たパッケージ(例: `esbuild`, `@parcel/watcher`)を**必要なものだけ**明示追加して `pnpm install` し直す(§2.6)。 |
| 14 | `nuxi typecheck` が失敗する | `vue-tsc` / `typescript` が devDependencies に無い。§3.1 の通り追加。 |
| 15 | VSCode で保存時に整形されない | `source.fixAll.eslint` が未設定、または別 formatter の `editor.defaultFormatter` 設定が競合。§2.4 の settings に揃える。 |

---

## 7. 運用ルール(リマインド)

- ホストには Docker 以外入れない。すべてコンテナ内。
- 新規ブランチに upstream は(指示なき限り)設定しない。
- 意味のある単位で定期的にコミットする。
- **PR は必ず Draft PR で作成。**
- コメント・コミットメッセージ・ドキュメントは日本語。
- 設計は分割統治・SOLID。PBT が効くロジックは `fast-check` を採用。

---

*このガイドは diary-task の環境構成を Nuxt 3 向けに再構成した単独版(2026-07 作成)。バージョンは §4 の手順で都度最新化すること。Lint 構成の選定根拠の詳細は Lint/Formatter 調査レポートを参照。*
