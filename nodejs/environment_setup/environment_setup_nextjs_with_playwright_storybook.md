# Next.js + Playwright + Storybook 新規プロジェクト 環境構築ガイド

> このファイルは、**Next.js(Static Export SPA)+ Playwright(E2E)+ Storybook(Story / Interaction / a11y)の環境をゼロから構築するときに AI エージェントへ渡す資料**です。
> `diary-task`(日次タスク管理 PoC)で確立した「Docker + devcontainer + テスト3層」の構成を、
> ほぼそのまま再現しつつ、各ツールのバージョンだけを最新安定版へ更新することを目的とします。
> **この資料は1ファイルで完結**しています。他の資料を参照しなくても環境一式を組み上げられるよう、
> 設定ファイルは全文を掲載し、各設定の "WHY"(なぜそうするか)もこの中に書いてあります。

---

## 0. この資料の使い方(エージェントへの前提指示)

あなた(エージェント)は、この資料を元に新規プロジェクトの開発環境を構築します。次の原則を必ず守ってください。

1. **ホストには Docker / Docker Compose 以外を一切インストールしない。**
   Node.js / pnpm / ブラウザバイナリ / その他の開発ツールはすべてコンテナ内に閉じる。開発は VSCode devcontainer か `docker compose` 経由で行う。
2. **バージョンは「参考ベースライン」をそのままコピーせず、§5 の手順で最新安定版を調べてから決める。**
   この資料に載っているバージョン番号は **2026年9月時点のベースライン**であり、参考値。構築直前に必ず再取得する。
   本文中の設定ファイルは `<NODE_MAJOR>` `<PNPM_VER>` のようなプレースホルダで書いてあるので、実値は §5.7 の表を見て置換する。
3. **構成は 3 層に分かれている。**
   - **第1部(§2)= 環境インフラ層**: framework 非依存。**ほぼそのまま再利用する。**
   - **第2部(§3)= アプリスタック層**: 「Next.js Static Export SPA の例」。**新規プロジェクトの性質に応じて差し替える。**
   - **第3部(§4)= テスト層**: **本資料の主眼。** Vitest / Storybook / Playwright の 3 層をどう分担させるか。
4. **各設定ファイルにはコメントで "WHY" を残す。** 落とし穴の多くはコメントが理由を説明している。安易に消さない。
   逆に、チャットのやり取り由来の表現(「案 A を選択」「議論の結果」など)や issue / PR 番号はコメントに書かない。設計判断の経緯はコミットメッセージに残す。
5. **プロジェクト名は `<PROJECT>` として書いてある。** ワークディレクトリのパスも `/<PROJECT>` に統一してある。両方を実プロジェクト名で置換する。
6. **Claude Code をコンテナ内で使う場合の追加設定は、本文には含まれず付録 A にまとめてある。**
   本文の Dockerfile / docker-compose / devcontainer は、それらを取り除いた素の構成である。必要な場合だけ付録 A を上乗せする。
7. 不明点・前提の置き換えが必要な箇所は、勝手に進めず確認を取る。

---

## 1. 環境の全体像

### 1.1 レイヤ構成図

```text
ホスト(Docker のみインストール)
└── Docker Compose
    └── app サービス(node:<NODE_MAJOR>-bookworm-slim ベース)
        ├── 第1部: 環境インフラ層(framework 非依存・再利用)
        │   ├── docker/Dockerfile      … corepack 焼き込み / Playwright の OS 依存ライブラリ
        │   ├── docker-compose.yml     … bind mount / named volume / ポート公開(3000, 6006)
        │   ├── .devcontainer/devcontainer.json … VSCode 接続 / 拡張 / features
        │   └── CI / Dependabot / audit / pnpm-workspace(サプライチェーン)
        ├── 第2部: アプリスタック層(差し替え可能)
        │   └── Next.js / React / Tailwind v4 / Biome / TypeScript
        └── 第3部: テスト層(本資料の主眼)
            ├── Vitest(project: unit)      … jsdom。純粋関数・コンポーネント契約
            ├── Vitest(project: storybook) … 実ブラウザ。play 関数 + axe(a11y)
            └── Playwright                  … 実ブラウザ。Static Export を serve で配信して E2E
```

### 1.2 利用モード(3 つ)

| モード | 用途 | 起動方法 |
|--------|------|---------|
| **A** | VSCode で開発(推奨) | コマンドパレット → `Dev Containers: Reopen in Container` |
| **B** | コンテナを直接起動 | `docker compose up`(`pnpm install && pnpm dev` 自動実行) |
| **C** | CI/単発実行 | `docker compose run --rm app pnpm <command>` |

Storybook(`pnpm storybook`)と E2E(`pnpm test:e2e`)はいずれも**自動起動しない**。開発サーバー(`pnpm dev`)と同時に立てられるよう別ポートを用意してあり、必要なときにコンテナ内で手動起動する。

### 1.3 テスト3層の役割分担

| 層 | コマンド | 実行環境 | 対象 | 何を守るか |
|---|---|---|---|---|
| **単体(unit)** | `pnpm test` | jsdom | `src/**/*.test.ts(x)` | 純粋関数のロジック、コンポーネントの**契約**の網羅。`fireEvent` の戻り値でしか判定できない挙動(既定動作の `preventDefault` など)を含む |
| **Story(storybook)** | `pnpm test:storybook` | 実ブラウザ(Chromium / headless) | `src/**/*.stories.tsx` | **Story として提示した状態から始まる操作**の検証(`play` 関数)と、axe による a11y 違反の検出 |
| **E2E** | `pnpm test:e2e` | 実ブラウザ(Chromium) | `e2e/**/*.spec.ts` | 実際にビルドした成果物(`out/`)を配信した状態での画面遷移・シナリオ |

3 層を分ける理由は **実行環境の要否が違う**ことにある。混在させると「ブラウザを用意できない環境では単体テストも動かせない」状態になり、CI のジョブ分割ができなくなる。詳細は §4.1。

**Story を書いたことは単体テストのアサーションを省略してよい理由にはならない。** `play` は「この見た目のとき、この操作で何が起きるか」を Storybook 上のデモと同じ文脈で確かめるものであり、コンポーネントの契約を網羅するのは `*.test.tsx` の役割である。

---

# 第1部 — 環境インフラ層(framework 非依存・必ず再利用)

この層は **新規プロジェクトでもほぼそのまま使える**。プロジェクト名(`<PROJECT>`)とワークディレクトリのパス(`/<PROJECT>`)だけ置換する。

## 2.1 ベースイメージと OS パッケージ

- ベースイメージ: `node:<NODE_MAJOR>-bookworm-slim`
- 必須 OS パッケージとその理由:

| パッケージ | 理由 |
|-----------|------|
| `git`, `curl`, `ca-certificates` | 基本ツール |
| `procps` | プロセス確認(`ps` 等) |
| (Playwright 公式 `install-deps` が入れる一式) | Chromium の実行に必要な共有ライブラリ群。**手書きで apt パッケージを列挙しない**(§2.2) |

`node:<NODE_MAJOR>-bookworm-slim` には Chromium が要求する OS ライブラリが入っていない。Storybook の Story テストも Playwright の E2E も実ブラウザを使うため、**テスト層を持つプロジェクトではこのライブラリ導入がインフラ層の必須要件**になる。

## 2.2 `docker/Dockerfile`

そのままコピーし、`<PROJECT>` / `<NODE_MAJOR>` / `<COREPACK_VER>` / `<PLAYWRIGHT_VER>` を §5 で決めた値に更新する。

```dockerfile
FROM node:<NODE_MAJOR>-bookworm-slim

# ユーザー名を引数で受け取る(docker-compose.yml の args から渡される)
# node:<NODE_MAJOR>-bookworm-slim は既定で node ユーザー(UID 1000)を持つので、
# デフォルトも node にしておく
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

# Playwright (Chromium) 実行に必要な OS 依存ライブラリ。
# 手書きの apt パッケージ列挙はブラウザ更新のたびにメンテが必要になるため、
# Playwright 公式の install-deps を使う。バージョンは package.json の
# @playwright/test と揃えること(ズレると必要なライブラリ一覧が変わりうる)。
RUN npx -y playwright@<PLAYWRIGHT_VER> install-deps chromium \
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
- **`playwright install-deps` は `npx -y playwright@<PLAYWRIGHT_VER>` で呼ぶ。** この時点ではまだ `pnpm install` していないので `pnpm exec` は使えない。バージョンは `package.json` の `@playwright/test` と手で揃える必要がある(§7 の落とし穴を参照)。
- **OS ライブラリはイメージ側で済ませ、ブラウザバイナリは実行時に取る。** ブラウザバイナリ(`~/.cache/ms-playwright`)はイメージに焼かない方針にしてあるため、コンテナ内では初回に一度だけ次を実行する。

  ```bash
  pnpm exec playwright install chromium
  ```

  **`--with-deps` は不要である。** OS ライブラリは上の `install-deps` で導入済みであり、`--with-deps` は内部で `sudo apt-get` を走らせるため、素の構成(sudo なし)では失敗する。CI の runner イメージには OS ライブラリが入っていないので、そちら側では `--with-deps` を付ける(§2.6)。

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
      # Storybook(pnpm storybook)。dev サーバーと同時に立てられるよう別ポートで公開する。
      # 開発サーバーと違い自動起動はせず、必要なときにコンテナ内で手動起動する。
      # Storybook dev サーバーは無認証のため、ホスト外(LAN)へは公開しない。ループバック限定。
      - "127.0.0.1:6006:6006"
    # NODE_ENV は environment: に書かない。コマンド側(next dev / next build)が自動で
    # 設定するため、ここで強制すると `pnpm build` 時に dev 値が残って prerender が壊れる。
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

1. **`environment:` に `NODE_ENV` を書かない。** dev 値が残ると Static Export の prerender が `<Html> should not be imported` で落ちる。`next dev` / `next build` がコマンド側で適切に設定する。
2. **Storybook の 6006 はループバック限定で公開する。** `storybook dev` はホスト指定なしのとき全インターフェースで listen するため、コンテナ内で起動してもポート公開だけでホストのブラウザから届く(`--host` の指定は不要)。ただし**無認証の dev サーバー**なので、`"6006:6006"` と書いて LAN に晒さないこと。
3. **Playwright が使う配信ポート(既定 4173)は公開しない。** `playwright.config.ts` の `webServer` がコンテナ内でだけ起動するもので、ホストから触る必要がない(§4.4.2)。Static Export の中身をホストのブラウザで直接確認したい場合に限り、`"127.0.0.1:4173:4173"` を足す。

### ブラウザバイナリと named volume の関係

`~/.cache/ms-playwright` は bind mount にも named volume にも載せていない。したがって**コンテナを作り直すとブラウザバイナリは消える**。`pnpm install` では取得されない(`node_modules` の外に置かれるため)ので、`pnpm exec playwright install chromium` を再実行する必要がある。§7 の落とし穴に再掲する。

> 毎回の取得を避けたい場合は `- app-playwright-browsers:/home/node/.cache/ms-playwright` を volume に足す選択肢もある。ただしバイナリと `package.json` の Playwright バージョンがずれたまま残る事故が起きうるため、この構成では採らず「消えたら取り直す」を既定にしている。

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
      // cSpell: disable
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
      // cSpell: enable
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
- **拡張機能**: `biomejs.biome` / `bradlc.vscode-tailwindcss` / `vitest.explorer` はアプリ層に応じて取捨選択してよい。`vitest.explorer` は §4.2 の project 分割(`unit` / `storybook`)をそのまま認識する。
- **features は SHA(digest)pin が望ましい**(§5.5 参照)。`devcontainer-lock.json` が自動生成される。

## 2.5 サプライチェーン対策

### `pnpm-workspace.yaml`

```yaml
minimumReleaseAge: 1440  # 1日以上経過したパッケージのみ許可
onlyBuiltDependencies: []  # ライフサイクル script は既定でブロック
```

- **`minimumReleaseAge`**: 公開直後の悪意あるバージョンを掴まないための時間ガード。
- **`onlyBuiltDependencies: []`**: postinstall 等のライフサイクルスクリプトを既定でブロック。必要なパッケージだけ明示的に許可する。
  - **Playwright / Storybook を入れると `pnpm install` がこの設定に引っかかる場合がある。** その場合でも「全部許可」にはせず、警告に出たパッケージ名だけを配列に追加する。なおブラウザバイナリの取得は postinstall ではなく `playwright install` の明示実行に任せているので、通常この配列に Playwright を足す必要はない。

### `.github/workflows/audit.yml`

```yaml
name: Audit

on:
  schedule:
    # 毎週月曜 09:00 JST (00:00 UTC) に実行
    - cron: "0 0 * * 1"
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
        uses: actions/setup-node@<SHA> # v7.x
        with:
          node-version: <NODE_LTS_MAJOR>
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # moderate 以下の advisory はログには表示されるが job は fail させない。
      # 上流 (framework 経由の transitive dep) で解消できないものへの過剰反応を避けるため。
      # 重大度を見直すときはこの --audit-level を上下させる。
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
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: Asia/Tokyo
    cooldown:
      default-days: 7
    open-pull-requests-limit: 5
    labels:
      - dependencies

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: Asia/Tokyo
    cooldown:
      default-days: 7
    labels:
      - dependencies
      - github-actions

  - package-ecosystem: docker
    directory: /docker
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: Asia/Tokyo
    cooldown:
      default-days: 7
    labels:
      - dependencies
      - docker
```

> **Dependabot が `@playwright/test` を上げても、Dockerfile の `playwright@<PLAYWRIGHT_VER> install-deps` は自動では追随しない。** npm と docker はエコシステムが別なので、Playwright を上げる PR では Dockerfile を手で合わせること(§5.6)。

## 2.6 CI(`.github/workflows/ci.yml`)— verify / e2e / storybook-test の3ジョブ

ジョブを 3 つに分けるのは **ブラウザの要否とコストが違う**ためである。

| ジョブ | 内容 | ブラウザ |
|---|---|---|
| `verify` | Story 網羅チェック / Lint / 型 / 単体テスト / アプリのビルド / Storybook の静的ビルド | 不要 |
| `e2e` | Static Export をビルドして `serve` で配信し、Playwright のシナリオを回す | Chromium |
| `storybook-test` | Story を実ブラウザで描画し、`play` 関数と axe を実行する | Chromium |

`storybook-test` を `verify` から分けているのは、ブラウザの用意(`playwright install --with-deps chromium`)のコストを **Lint・型チェック・単体テストの結果を得るまでの時間に載せない**ためである。3 つのジョブは並列に実行される。

`pnpm build-storybook`(Storybook の設定破損の検知)を `storybook-test` ではなく `verify` に置いているのは、**ブラウザを必要としない**からである。ブラウザ用意のコストを払わずに設定の妥当性だけを毎回確かめられる。

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

      # Story の漏れは PR の時点で止める。push(main / develop)では実行しない —
      # マージ済みの内容を今さら止めても漏れは防げないため、ゲートは PR に一本化する。
      # 検査は作業ツリーの全件整合を見るだけで比較対象のコミットを必要としないので、
      # shallow な checkout のままで足りる(base のコミットの追加取得は不要)。
      #
      # Node も依存も要らない(bash とファイルの有無だけの)検査なので、セットアップより
      # 前に置いて最短で落とす。
      - name: Story check
        if: github.event_name == 'pull_request'
        run: bash scripts/check-stories.sh

      - name: Setup pnpm
        uses: pnpm/action-setup@<SHA> # v6.x

      - name: Setup Node.js
        uses: actions/setup-node@<SHA> # v7.x
        with:
          node-version: <NODE_LTS_MAJOR>   # CI は LTS を使う(§5.2 の注記参照)
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

      # Storybook の設定破損(main.ts / preview.tsx / アドオンの構成ミス)は
      # アプリ本体のビルドでは検知できないため、静的ビルドが通ることを別途確認する。
      # ブラウザを必要としないので storybook-test ジョブではなくこちらに置き、
      # ブラウザ用意のコストを払わずに設定の妥当性だけを毎回確かめる。
      - name: Build Storybook
        run: pnpm build-storybook

  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@<SHA> # v7.x

      - name: Setup pnpm
        uses: pnpm/action-setup@<SHA> # v6.x

      - name: Setup Node.js
        uses: actions/setup-node@<SHA> # v7.x
        with:
          node-version: <NODE_LTS_MAJOR>
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Get Playwright version
        id: playwright-version
        run: echo "version=$(node -p "require('./package.json').devDependencies['@playwright/test']")" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        uses: actions/cache@<SHA> # v6.x
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: E2E test
        run: pnpm test:e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@<SHA> # v7.x
        with:
          name: playwright-report-e2e
          path: |
            playwright-report/
            test-results/
          retention-days: 7

  storybook-test:
    name: Storybook Test (Play / a11y)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@<SHA> # v7.x

      - name: Setup pnpm
        uses: pnpm/action-setup@<SHA> # v6.x

      - name: Setup Node.js
        uses: actions/setup-node@<SHA> # v7.x
        with:
          node-version: <NODE_LTS_MAJOR>
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # ブラウザバイナリは pnpm のキャッシュには含まれない(node_modules の外に置かれる)ため、
      # 別途キャッシュする。playwright のバージョンは lockfile にのみ現れるので、その
      # ハッシュをキーにする。lockfile が変わればキャッシュは捨てられるが、次のステップの
      # playwright install が再取得するので不整合にはならない。
      - name: Cache Playwright browsers
        uses: actions/cache@<SHA> # v6.x
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('pnpm-lock.yaml') }}

      # キャッシュヒット時もこのステップは実行する。バイナリのダウンロードは playwright 側で
      # スキップされる一方、OS のライブラリ(--with-deps)はキャッシュ対象外で毎回必要なため。
      - name: Install Playwright Chromium
        run: pnpm exec playwright install --with-deps chromium

      # Story を実ブラウザで描画し、play 関数と addon-a11y の axe チェックを実行する。
      # 単体テスト(verify ジョブの pnpm test)とはブラウザの要否が違うのでジョブを分けている。
      - name: Story test (play / a11y)
        run: pnpm test:storybook
```

**2 つの `Cache Playwright browsers` でキーの作り方が違う点に注意。** `e2e` 側は `package.json` から読んだ `@playwright/test` の宣言値、`storybook-test` 側は `pnpm-lock.yaml` のハッシュをキーにしている。どちらでも動くが、**lockfile ハッシュのほうが「実際に入るバージョン」に忠実**(レンジ指定でも解決結果の変化を検知できる)である一方、無関係な依存更新でもキャッシュが捨てられる。新規プロジェクトでは**どちらか一方に統一する**のが望ましい。

> **CI と開発コンテナで Node メジャーが異なってよい。**
> 開発コンテナは Current 系、CI は Active LTS を使うのが既定の方針。アプリの実行ターゲットに合わせるなら CI は LTS が無難。両者を揃えたい場合は §5.2 の方針で統一する。

---

# 第2部 — アプリスタック層(例: Next.js Static Export SPA)

> **ここは「Next.js SPA だった場合の例」**。新規プロジェクトが別 framework(API サーバー、CLI、別フロント等)なら、
> このセクションを丸ごと差し替える。**第1部のインフラ層は据え置きでよい。**
> ただし第3部のテスト層は Static Export を前提にした箇所がある(§4.4.3)ので、差し替え時はそちらも読むこと。

## 3.1 `package.json`

`packageManager` フィールドが pnpm バージョンの唯一のソース(§2.2 と対応)。バージョンは §5 で最新化する。

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
    // Story 網羅チェック(§4.3.6)。bash とファイルの有無だけで動く
    "check:stories": "bash scripts/check-stories.sh",
    "type-check": "tsc --noEmit",
    // テストは project で分ける(§4.2)。--project= の値は vitest.config.ts の name と対応する
    "test": "vitest run --project=unit",
    "test:watch": "vitest --project=unit",
    "test:ui": "vitest --ui --project=unit",
    "test:storybook": "vitest run --project=storybook",
    // E2E は必ずビルドしてから。out/ が古いまま検証するのを防ぐ(§4.4.3)
    "test:e2e": "next build && playwright test",
    // ビルド済みの out/ をそのまま使いたいとき(直前に build している場合の時短)
    "test:e2e:only": "playwright test",
    // playwright.config.ts の webServer から呼ばれる。ポートは開発サーバーと衝突させない
    "serve:out": "serve out -l 4173",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "next": "<NEXT_VER>",
    "react": "<REACT_VER>",
    "react-dom": "<REACT_VER>"
    // 必要に応じて: zod, uuidv7, yaml, @dnd-kit/core, react-markdown 等
  },
  "devDependencies": {
    // --- アプリスタック層 ---
    "@biomejs/biome": "<BIOME_VER>",
    "@tailwindcss/postcss": "<TAILWIND_VER>",
    "tailwindcss": "<TAILWIND_VER>",
    "typescript": "<TS_VER>",
    "@types/node": "<TYPES_NODE_VER>",
    "@types/react": "<TYPES_REACT_VER>",
    "@types/react-dom": "<TYPES_REACT_DOM_VER>",
    // --- テスト層: 単体(jsdom) ---
    "vitest": "<VITEST_VER>",
    "@vitest/ui": "<VITEST_VER>",
    "@vitejs/plugin-react": "<PLUGIN_REACT_VER>",
    "@testing-library/react": "<TL_REACT_VER>",
    "@testing-library/dom": "<TL_DOM_VER>",
    "@testing-library/jest-dom": "<TL_JEST_DOM_VER>",
    "@testing-library/user-event": "<TL_USER_EVENT_VER>",
    "jsdom": "<JSDOM_VER>",
    "fast-check": "<FASTCHECK_VER>",
    // --- テスト層: Story(実ブラウザ) ---
    "storybook": "<STORYBOOK_VER>",
    "@storybook/nextjs-vite": "<STORYBOOK_VER>",
    "@storybook/addon-a11y": "<STORYBOOK_VER>",
    "@storybook/addon-docs": "<STORYBOOK_VER>",
    "@storybook/addon-vitest": "<STORYBOOK_VER>",
    "@vitest/browser-playwright": "<VITEST_VER>",
    "vite": "<VITE_VER>",
    // --- テスト層: E2E(実ブラウザ) ---
    "@playwright/test": "<PLAYWRIGHT_VER>",
    "playwright": "<PLAYWRIGHT_VER>",
    "serve": "<SERVE_VER>"
  },
  "pnpm": {
    // 監査(§2.5 の audit.yml)で指摘された脆弱性のうち、上流の依存が対応するまで
    // 待てないものをここで固定する。内容はプロジェクト固有なので、新規では空にして
    // pnpm audit の結果に応じて追加する。上流が解消したら行を消す。
    "overrides": {}
  }
}
```

**バージョンの揃え方(重要):**

| 揃える対象 | 理由 |
|---|---|
| `storybook` と `@storybook/*` を**すべて同一バージョン**にする | アドオンとコアのバージョンがずれると Storybook が起動時に警告・エラーを出す |
| `@playwright/test` と `playwright` を同一バージョンにする | 両者が別バージョンだとブラウザバイナリの参照先がずれる |
| `@playwright/test` と Dockerfile の `playwright@<PLAYWRIGHT_VER> install-deps` を同一バージョンにする | 必要な OS ライブラリの一覧がバージョンで変わりうる(§5.6) |
| `vitest` / `@vitest/ui` / `@vitest/browser-playwright` を同一バージョンにする | Vitest 本体とブラウザプロバイダの内部 API が結合している |

**`serve` が dependencies ではなく devDependencies にある理由**: Static Export の成果物を Playwright に食わせるためだけの開発用サーバーであり、本番配信には使わない(§4.4.3)。

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

`output: "export"` により `next build` が `out/` に静的ファイル一式を吐く。これが Playwright の検証対象になる(§4.4.3)。

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
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts",
    // ドット始まりのディレクトリは既定の **/*.ts グロブにマッチしないため明示する。
    // これが無いと .storybook/ 配下が型チェックの対象外になり、さらに
    // vite-tsconfig-paths が tsconfig の include に含まれるファイルしか解決しないため、
    // .storybook/ 配下での `@/` import も動かなくなる(§4.3.2)。
    ".storybook/**/*.ts",
    ".storybook/**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
```

この `include` は `pnpm type-check` だけでなく `next build`(既定で型チェックを行う)にも効く。したがって `.storybook/` 配下の型エラーは `next build` でも検知される。

> `e2e/**/*.ts` は既定の `**/*.ts` グロブに含まれるため、明示の追加は不要である。Playwright のスペックも型チェックの対象になる。

## 3.4 `postcss.config.mjs` / Tailwind v4

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Tailwind v4 は **CSS-first 構成**であり、`tailwind.config.js` ではなく CSS 側(`src/app/globals.css`)に `@import "tailwindcss";` やプラグイン指定(`@plugin "@tailwindcss/typography";`)を書く。

**Storybook との関係**: Vite はプロジェクトルートの `postcss.config.mjs` を自動検出するため、Storybook 側でも Tailwind の設定を二重に書く必要はない。ただし **CSS の読み込み経路だけは Storybook 用に用意する必要がある**(§4.3.3)。

## 3.5 `biome.json`

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/<BIOME_VER>/schema.json",
  "files": {
    "includes": [
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/**/*.js",
      "src/**/*.jsx",
      "src/**/*.json",
      "vitest.config.ts",
      "vitest.setup.ts",
      "next.config.ts",
      "playwright.config.ts",
      ".storybook/**/*.ts",
      ".storybook/**/*.tsx",
      "e2e/**/*.ts",
      // テスト実行時に生成される出力は対象外にする
      "!test-results",
      "!playwright-report",
      "!blob-report"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": { "maxAllowedComplexity": 15 }
        },
        "noExcessiveLinesPerFunction": {
          "level": "warn",
          "options": { "maxLines": 80 }
        }
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "overrides": [
    {
      "includes": ["**/*.test.ts", "**/*.test.tsx"],
      "linter": {
        "rules": {
          "complexity": {
            "noExcessiveLinesPerFunction": {
              "level": "warn",
              "options": { "maxLines": 300 }
            }
          }
        }
      }
    }
  ]
}
```

> `$schema` の URL に Biome のバージョンが含まれる。Biome を上げたらここも更新する。

**テスト層に関わる注意:**

- `src/**/*.stories.tsx` は `src/**` に含まれるため対象である。Story ファイルも Biome のルール(未使用 import の禁止など)に従う。
- `.storybook/` と `e2e/` は `src/**` の外なので**明示的に追加が必要**。追加を忘れると、Story テンプレートや E2E スペックだけフォーマット・Lint の対象外になる。
- `overrides` の行数緩和は `*.test.ts(x)` にしか効いていない。`*.stories.tsx` や `e2e/*.spec.ts` が長くなる場合は、緩和対象を広げるか Story / スペックを分割する。**既定では広げない**(Story は 1 ファイル 1 コンポーネントに保つほうが読みやすいため)。

### 別 framework に差し替える際に触る箇所(チェックリスト)

- [ ] `package.json` の `dependencies` / `scripts`(`dev` / `build` / `start` / `serve:out`)
- [ ] `next.config.ts` / `postcss.config.mjs` / Tailwind(フロントでなければ不要)
- [ ] `tsconfig.json` の `jsx` / `plugins`(Next 非依存なら削除)
- [ ] `vitest.config.ts` の `environment`(Node 系なら `node`、`jsdom` 不要)
- [ ] `.storybook/main.ts` の `framework`(`@storybook/nextjs-vite` → `@storybook/react-vite` など)
- [ ] `playwright.config.ts` の `webServer.command`(Static Export でないなら `next start` 等に変更、§4.4.3)
- [ ] `biome.json` の `files.includes`
- [ ] CI の `Build` ステップ(Static Export 以外なら変更)
- [ ] ポート番号(`docker-compose.yml` の `ports` と各サーバー)

---

# 第3部 — テスト層(本資料の主眼)

## 4.1 テスト3層の設計方針

### 分ける単位は「実行環境」

3 層の第一の分割軸は**実行環境(jsdom か実ブラウザか)**である。テストの粒度(単体 / 結合 / E2E)ではない。

```text
jsdom を使う          実ブラウザを使う
─────────────         ──────────────────────────────
Vitest (unit)         Vitest (storybook)     Playwright
                      ↑ Story を描画          ↑ ビルド成果物を配信
```

この分割により次が成り立つ。

- **ブラウザバイナリを用意していない環境でも `pnpm test` は動く。** 開発初日やコンテナ作り直し直後でも、単体テストだけは即座に回せる。
- **CI のジョブを並列化できる。** ブラウザ用意のコスト(数十秒〜)を、Lint・型チェック・単体テストの結果を得るまでの時間に載せない(§2.6)。
- **失敗の切り分けが速い。** jsdom でしか落ちないなら DOM 実装の差、実ブラウザでしか落ちないならレイアウト・座標・実イベントの問題、と当たりが付く。

### 何をどこで検証するか

| 検証したいこと | 担当 | 理由 |
|---|---|---|
| 純粋関数・reducer のロジック | unit | ブラウザ不要。プロパティベーステスト(§4.5)が最も効く層 |
| コンポーネントの**契約**の網羅 | unit | Story にしない args の組み合わせ、`fireEvent` の戻り値でしか判定できない挙動(既定動作の `preventDefault` など)を書ける |
| Story として提示した状態から始まる操作 | storybook(`play`) | Story の args と描画結果がそのまま前提条件になる。Storybook 上のデモと同じ文脈で検証できる |
| アクセシビリティ違反の混入 | storybook(axe) | Story がそのまま検査対象になるので、対象を別途用意しなくてよい(§4.3.7) |
| 座標・実イベントに依存する挙動(ドラッグ&ドロップ等) | storybook / E2E | jsdom は `getBoundingClientRect` が 0 を返すため衝突判定が成立しない(§4.4.5) |
| 画面をまたぐ遷移、ビルド成果物の妥当性 | E2E | ルーティング・アセット参照の破綻はビルド後にしか出ない(§4.4.3) |

### 重複を許容する境界

**「Story を書いたから単体テストを省く」も「E2E があるから Story を省く」も採らない。** ただし無制限に重ねるのではなく、次の線を引く。

- 同じ操作を **`play` と E2E の両方で通さない**。E2E は「画面をまたぐ経路」に絞り、コンポーネント内で完結する操作は `play` に寄せる。
- 上位コンポーネントの Story が実アプリと同じ組み合わせで下位を描画しているなら、下位の Story は足さない(§4.3.6 の見送り観点)。

---

## 4.2 Vitest — マルチプロジェクト構成(unit / storybook)

### `vitest.config.ts`

```typescript
import path from "node:path";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// テストは実行環境の異なる2系統に分かれるため、Vitest の project として分離する。
// 混在させると「ブラウザを用意できない環境では単体テストも動かせない」状態になり、
// CI のジョブ分割(単体テストはブラウザ不要、Story テストは Chromium 必須)ができなくなる。
// project 名は package.json の `--project=` 指定と対応しているので、変更する場合は両方直すこと。
export default defineConfig({
  test: {
    projects: [
      // unit: src/**/*.test.ts(x)。jsdom 上で Testing Library を使う従来の単体テスト。
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: false,
          setupFiles: ["./vitest.setup.ts"],
          css: true,
          // e2e/ は Playwright のテストなので Vitest の収集対象から外す。
          exclude: [...configDefaults.exclude, "e2e/**"],
        },
      },
      // storybook: src/**/*.stories.tsx。実ブラウザ上で Story を描画し、play 関数と
      // addon-a11y の axe チェックをテストとして実行する。
      {
        // storybookTest は .storybook/main.ts を読んで Story の探索グロブと framework
        // (@storybook/nextjs-vite)の Vite 設定を取り込む。react プラグインや tsconfig の
        // paths(`@/`)の解決も framework 側が行うため、unit 側のような明示指定は不要である。
        // preview.tsx の設定(globals.css / parameters)も同プラグインが自動で適用するので、
        // setProjectAnnotations を呼ぶセットアップファイルは置いていない。
        plugins: [storybookTest({ configDir: path.join(__dirname, ".storybook") })],
        // 依存最適化のフレークを踏んだときの緊急避難先。既定では空でよい。
        // Storybook 10.3 以降は Story ファイルと preview annotation を `optimizeDeps.entries`
        // に自動投入して事前クロールするため、通常は手動で列挙しなくても新しい依存は
        // 事前バンドルされる。フレークを踏んだら、ここへの追記は対症療法であり、
        // まずキャッシュを消して再現するか確かめること(消し方は §7 の落とし穴)。
        optimizeDeps: {
          include: [],
        },
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
```

### `vitest.setup.ts`

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

`setupFiles` は **`unit` project にしか付けていない**。`storybook` project 側は `storybookTest` プラグインが `preview.tsx` の annotation を自動適用するので、`setProjectAnnotations` を呼ぶセットアップファイルを別途置く必要がない。

### 設計上の要点

| 要点 | 内容 |
|---|---|
| **project 名はコマンドと対応する** | `package.json` の `--project=unit` / `--project=storybook` と `test.name` が 1:1。片方だけ変えると無言でテスト 0 件になる |
| **`unit` 側だけ alias を明示する** | `storybook` 側は framework(`@storybook/nextjs-vite`)に同梱の `vite-tsconfig-paths` が `tsconfig.json` の `paths` を読む。二重に書かない |
| **`exclude` で `e2e/**` を外す** | Playwright のスペック(`*.spec.ts`)を Vitest が拾うと、`test`/`expect` の import 元が違うため意味不明なエラーになる |
| **`globals: false`** | `describe` / `it` / `expect` は明示 import する。どのテストランナーの API かがファイル単独で読めるようにするため |
| **`css: true`** | jsdom 側でも CSS を読み込む。クラス名の有無に依存するアサーションが動くようにする |

---

## 4.3 Storybook

### 4.3.1 導入手順

```bash
# コンテナ内で実行する(ホストには何も入れない)
pnpm dlx storybook@latest init
```

スキャフォールドが `.storybook/main.ts` / `.storybook/preview.ts` と、サンプル Story 一式を生成する。そのあと次を手で整える。

1. `.storybook/preview.ts` を **`.storybook/preview.tsx` に改名**する(デコレータや JSX を書けるようにするため)。
2. `.storybook/main.ts` の `stories` グロブを `../src` 配下に限定する(§4.3.2)。
3. スキャフォールドが生成したサンプル Story(`src/stories/` 等)を削除する。**Story は対象コンポーネントと同じディレクトリに置く**規約にするため(§4.3.5)。
4. `@storybook/addon-a11y` / `@storybook/addon-docs` / `@storybook/addon-vitest` を導入し、`main.ts` の `addons` に並べる。
5. `tsconfig.json` の `include` に `.storybook/**/*.ts` / `.storybook/**/*.tsx` を追加する(§3.3)。
6. `biome.json` の `files.includes` に同じく `.storybook/**` を追加する(§3.5)。
7. `.gitignore` に次を追加する。

   ```text
   *storybook.log
   storybook-static
   ```

**起動と静的ビルド:**

```bash
pnpm storybook          # → http://localhost:6006(dev サーバー)
pnpm build-storybook    # → storybook-static/(静的ビルド)
```

ホストのシェルから実行する場合は `docker compose exec app pnpm storybook`。

> `tags: ["autodocs"]` を付けた Story は docs ページに **Story のソースコードを埋め込む**。`storybook-static/` を公開ホスティングする場合は、実装の詳細が閲覧可能になる点を踏まえ、認証付きの配信を前提とすること。

### 4.3.2 `.storybook/main.ts`

```typescript
import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs", "@storybook/addon-vitest"],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  core: {
    // 匿名の利用統計であっても開発環境から外部へ送信しない方針のため、既定で有効な
    // テレメトリを明示的に無効化する。
    disableTelemetry: true,
  },
};

export default config;
```

| 設定 | 意図 |
|---|---|
| `stories` を `../src` 配下に限定 | `.storybook/templates/` に置くコピー元テンプレート(§4.3.5)を Story として読み込ませないため。テンプレートは型チェックの対象にはしたいが Storybook には出したくない |
| `framework: "@storybook/nextjs-vite"` | Next.js 向けの Vite ビルダー。`next/image` `next/link` `next/navigation` のモックと、`vite-tsconfig-paths` による `@/` 解決を同梱する |
| `staticDirs: ["../public"]` | アプリと同じ静的ファイル(favicon、画像など)を Story からも参照できるようにする |
| `core.disableTelemetry: true` | 匿名統計であっても開発環境から外部送信しない |

**`@/` エイリアスの解決経路**: `vite-tsconfig-paths` が `tsconfig.json` の `paths` を読む。**解決対象は tsconfig の `include` に含まれるファイルに限られる**ため、§3.3 の `include` 追加は型チェックだけでなく `.storybook/` 配下での `@/` import の動作にも効いている。

### 4.3.3 `.storybook/preview.tsx`

```tsx
// アプリ本体は src/app/layout.tsx が globals.css を読み込むが、Storybook は
// Next.js のレイアウト(layout.tsx)を経由せず個々のコンポーネントを直接描画するため、
// ここで読み込まないと全 Story で Tailwind のスタイルが一切当たらない。
// 全 Story に共通で必要な唯一のスタイルなので preview で一度だけ import する。
// Vite はプロジェクトルートの postcss.config.mjs を自動検出するため、Tailwind v4 の
// CSS-first 構成(@import "tailwindcss" / @plugin "@tailwindcss/typography")は
// @tailwindcss/postcss 経由でそのまま解決される。
import "../src/app/globals.css";
import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  parameters: {
    a11y: {
      // axe の違反を Story テスト(vitest --project=storybook)の失敗として扱う。
      // 既定値の "todo" は違反を警告に留めるため、CI に組み込んでも退行を止められない。
      // 立ち上げ時点で全 Story が違反ゼロなら、最初から "error" にして違反の混入を防ぐ。
      // 個別の Story で例外を認める必要が出たら、preview 全体を緩めるのではなく、
      // その Story の parameters.a11y でルールを限定して無効化すること。
      test: "error",
    },
    controls: {
      // arg 名から control の種類(color picker / date picker)を推測させる設定。
      matchers: {
        // スキャフォールドの既定値をそのまま維持する。background / color で終わる arg は
        // 色を表すものだけであり、置き換える理由がないため。
        color: /(background|color)$/i,
        // 既定値の /Date$/i は大文字小文字を無視するので、単に "date" で終わる語
        // (update など)まで日付とみなして date picker を割り当ててしまう。
        // camelCase の境界(arg 名そのものが date か、大文字始まりの Date が末尾に付く)を
        // 要求して、日付でない arg への誤マッチを防ぐ。
        date: /^(date|.*[A-Z]Date)$/,
      },
    },
  },
};

export default preview;
```

**この 3 点が preview.tsx の全責務である。**

1. **グローバル CSS の読み込み** — Storybook は `layout.tsx` を経由しないため、**この import が唯一のスタイル読み込み経路**である。消すと全 Story のスタイルが落ちる(§7)。
2. **a11y の失敗レベル** — §4.3.7。
3. **controls の matchers** — 既定の `date` matcher は誤マッチしやすいので締める。

**デコレータは preview に書かない。** 全 Story に一律適用せず、必要な Story が opt-in する(§4.3.4)。

### 4.3.4 デコレータ設計

Story にグローバル state(Context / Provider)やレイアウト枠を注入する共通部品を **デコレータ**として `src/storybook/decorators/` に置く。

#### 方針 1: 一律適用せず、Story から opt-in させる

`preview.tsx` で全 Story にラップしない。理由は 2 つ。

- **Presentational / UI パーツは Context を参照しない**という設計規約があるなら、一律にラップすると「この Story は本当に Provider が要るのか」が読めなくなる。
- Context 由来の不具合を Story 単体で切り分けられなくなる。

#### 方針 2: 1 ファイル 1 デコレータ。バレル(`index.ts`)を置かない

```tsx
// デコレータは1ファイル1つで公開し、バレル(index.ts)は置かない。バレルを経由すると、
// どれか1つだけを使いたい Story もこのディレクトリ全体の依存(state 系デコレータが使う
// reducer / Context、DnD 系デコレータが使うドラッグライブラリ)を評価してしまい、依存を
// 持たないレイアウト枠デコレータの利用者にまで重い依存が波及するため。
```

これは Story テストの実行時間と依存最適化に直接効く。`@/storybook/decorators/withXxx` の形で個別に import する。`@/` は `src/` を指すので、Story ファイルの深さに関わらず同じ import 文になる。

#### 方針 3: state 注入はファクトリにして seed を引数で受ける

```tsx
import type { Decorator } from "@storybook/nextjs-vite";
import { type ReactNode, useReducer } from "react";
import { DispatchContext } from "@/contexts/DispatchContext";
import { StateContext } from "@/contexts/StateContext";
import { appReducer } from "@/reducers/appReducer";
import type { AppState } from "@/types/state";

/**
 * 与えた state を初期値とするグローバル state スコープで Story をラップするデコレータを作る。
 *
 * `useReducer(appReducer, seed)` の結果を `StateContext` / `DispatchContext` に直接流す。
 * Provider の入れ子は実アプリ(`src/app/page.tsx`)の構成と順序を揃えること。Provider の
 * 依存関係が原因の不具合を Story でも再現できるようにするためである。
 *
 * dispatch は本物の reducer を通るため、Story 上の操作でも実アプリと同じ状態遷移が起きる。
 * 結合テストのハーネスと同じ組み方にしておけば、テストで再現できた状況はそのまま Story にも
 * 持ち込める。
 *
 * 永続化(localStorage 等)には一切触れない。Story の state を永続化すると、
 * (a) アプリと同一 origin へ配信した `storybook-static` が閲覧者の実データを書き換えてしまう、
 * (b) autodocs のように複数 Story が同時に描画されるページで同じ保存キーへの書き戻しが競合する、
 * という問題が起きる。state をメモリ上に閉じることで、Story は「同じ seed と args なら同じ
 * 結果になるもの」として保てる。
 *
 * @param seed Story の初期 state。各モードの invariant を満たした state を組み立てられる
 *   fixture factory を用意し、それを基点にすること。
 */
export function withAppState(seed: AppState): Decorator {
  // seed を閉じ込めたコンポーネントをファクトリ内で定義する。ファクトリの呼び出しは
  // meta の評価時の1回きりなので、コンポーネントの識別子は Story の再描画をまたいで安定する。
  function AppStateScope({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(appReducer, seed);

    return (
      <StateContext.Provider value={state}>
        <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
      </StateContext.Provider>
    );
  }

  return (Story) => (
    <AppStateScope>
      <Story />
    </AppStateScope>
  );
}
```

**ファクトリ内でコンポーネントを定義する理由**が要点である。`(Story) => <Provider>...</Provider>` を毎レンダリング新しい関数として作ると React が別コンポーネントとみなして state を捨てる。ファクトリの呼び出しは meta 評価時の 1 回きりなので、この形なら識別子が安定する。

「初期状態」用の派生は 1 行で書ける。

```tsx
export const withAppProvider: Decorator = withAppState(initialAppState);
```

#### 方針 4: レイアウト枠デコレータは「最小限であること」を明記する

```tsx
/**
 * Story を最小限のページ枠(最大幅 + 余白)でラップする。
 *
 * 画面全体を占めるコンポーネントの Story が canvas の左上に張り付いて読みにくくなるのを
 * 防ぐための枠であり、アプリの実レイアウトを再現するものではない。実レイアウトを使った
 * 検証は Layout 層そのものを Story の対象にして行う。ペインの高さ・スクロール境界に
 * 依存する崩れの検証には使えない。
 */
export const withPageFrame: Decorator = (Story) => (
  <div className="mx-auto max-w-5xl p-4">
    <Story />
  </div>
);
```

依存を一切持たないデコレータなので、これがバレル経由で重い依存を巻き込まないことが方針 2 の実利である。

#### デコレータを使う側が知っておくべき 4 点

| # | 内容 |
|---|---|
| 1 | **`decorators` 配列は後ろにあるものほど外側**に適用され、**meta のデコレータは Story のデコレータより必ず外側**になる。内側の Scope が外側の Context を参照する組み合わせでは、並び順を崩すと Provider 外参照で例外になる |
| 2 | seed を Story ごとに変える場合は、**state 系デコレータも Story 単位に置く**。meta 側に置くと seed を差し替えられないうえ、「meta に state、Story に Scope」の分割は #1 の外側/内側の関係から成立しない |
| 3 | state は永続化しないので、**Story 内で作ったデータは次の Story に持ち越されない**。逆に言えば Story は再現可能である |
| 4 | 初回描画から state が入った状態で描画される(マウント完了まで `null` を返す実 Provider と違う)。したがって `play` 関数では `findBy*` による描画待ちは不要で、**`getBy*` を使ってよい** |

#### 提供しない Context がある場合

デコレータが提供しない Context を参照するコンポーネントは、そのデコレータの下では **Provider 外参照の例外**になる。例えば「保存状態」の Context は、永続化しない方針のデコレータでは提供しようがない。

この場合、**Container の Story を無理に作らず、Presentational なコンポーネントを直接 Story の対象にする**。これは §4.3.6 の見送り観点「技術的制約」に該当し、見送りの理由として宣言する。

### 4.3.5 Story の書き方テンプレート

`.storybook/templates/` にコピー元を 2 種類置く。`main.ts` の `stories` グロブが `../src` 配下に限定されているので、テンプレート自体は Story として読み込まれない。一方 `tsconfig.json` の `include` には `.storybook/**` が入っているので**型チェックの対象**であり、コピー元が実コンポーネントの props とずれたら型エラーで気付ける。

| 対象 | テンプレート |
|---|---|
| Display 系(ハンドラ props を持たない) | `.storybook/templates/display.stories.tsx` |
| ハンドラを持つ UI パーツ / 複数ハンドラを持つ Compound | `.storybook/templates/input.stories.tsx` |

#### `.storybook/templates/display.stories.tsx`

```tsx
// Story を新規に書くときのコピー元テンプレート。
// - Meta/StoryObj は導入済みのフレームワークパッケージ @storybook/nextjs-vite から
//   import する(型の実体は @storybook/react の再 export だが、直接依存していない
//   パッケージ名を書かないためフレームワーク側から import する)。
// - テストユーティリティ(expect/fn/userEvent/within)は `storybook/test` から
//   import する(Storybook 9 以降。8 系の `@storybook/test` は使わない)。
// - このファイルは tsconfig.json の include に .storybook 配下を明示的に追加して
//   あるため pnpm run type-check の対象である。コピー元が実コンポーネントの props と
//   ずれたら型エラーで気付ける状態を保つこと。
// - .storybook/main.ts の stories グロブは ../src 配下のみを対象にしているため、
//   このファイル自体は Storybook の Story として読み込まれない。
//
// Display系コンポーネント用の Story テンプレート(CSF3)。
// Display系は props のみで描画されるため、args の組み合わせを列挙するだけで
// Story が完結する。ハンドラを渡さないため play 関数は基本的に不要。
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
// 記入例として実在のコンポーネントを import している。
// 実際に Story を書く際は、対象のコンポーネントに置き換えること。
import { StatusBanner } from "@/components/layout/StatusBanner";

const meta = {
  title: "Components/Layout/StatusBanner",
  component: StatusBanner,
  parameters: {
    // Display系は入力を持たないため、layout は centered で十分なことが多い。
    layout: "centered",
  },
} satisfies Meta<typeof StatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warning: Story = {
  args: {
    level: "warning",
  },
};

export const Error: Story = {
  args: {
    level: "error",
  },
};

// level が null のときは StatusBanner 自体が null を返す(非表示)。
// 「何も出ない」ことも提示すべき状態のひとつである。
export const Hidden: Story = {
  args: {
    level: null,
  },
};
```

#### `.storybook/templates/input.stories.tsx`

```tsx
// Story を新規に書くときのコピー元テンプレート。
// - Meta/StoryObj は導入済みのフレームワークパッケージ @storybook/nextjs-vite から
//   import する。
// - テストユーティリティ(expect/fn/userEvent/within)は `storybook/test` から
//   import する(Storybook 9 以降。8 系の `@storybook/test` は使わない)。
// - このファイルは型チェックの対象だが、Story としては読み込まれない(display 側と同じ)。
//
// Input系コンポーネント用の Story テンプレート(CSF3)。
// onChange は fn() でモック化し、Storybook の Actions パネルで呼び出しを
// 確認できるようにする。play 関数では userEvent でユーザー操作をシミュレート
// し、onChange が期待通り呼び出されるかを Interaction テストとして検証する。
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
// 記入例として実在のコンポーネントを import している。
// 実際に Story を書く際は、対象のコンポーネントに置き換えること。
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const meta = {
  title: "Components/UI/SegmentedTabs",
  component: SegmentedTabs,
  args: {
    // onChange は必ず fn() でモック化する。実装を直接渡すと Interaction
    // テストや Actions パネルでの呼び出し確認ができなくなるため。
    onChange: fn(),
  },
} satisfies Meta<typeof SegmentedTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

// args は架空の文言ではなく、実在の呼び出し元が渡している値に合わせる。
// そうすることで、Story からそのコンポーネントの実際の用途が読み取れる。
const baseArgs = {
  value: "priority" as const,
  ariaLabel: "表示モード",
  containerTestId: "view-mode-tabs",
  testIdPrefix: "view-mode-tab",
  tabs: [
    { value: "priority" as const, label: "優先度順" },
    { value: "group" as const, label: "グループ毎" },
  ],
};

export const Default: Story = {
  args: baseArgs,
};

// Interaction テスト: 2番目のタブをクリックし、onChange がそのタブの value
// で呼び出されることを検証する。
export const ClickSecondTab: Story = {
  args: baseArgs,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("view-mode-tab-group"));
    await expect(args.onChange).toHaveBeenCalledWith("group");
  },
};

// キーボード分岐の検証にはタブが3値以上必要になる: 2値だと ArrowRight の隣接移動先と
// ArrowLeft の循環移動先が同じ値になり、どちらの分岐を通ったのかをアサーションで
// 区別できないため。
const threeTabArgs = {
  ...baseArgs,
  tabs: [
    { value: "priority" as const, label: "優先度順" },
    { value: "grouped" as const, label: "グループ毎" },
    { value: "kanban" as const, label: "カンバン" },
  ],
};

// Interaction テスト: キーボード操作でも onChange が発火することを検証する
// (a11y 観点: WAI-ARIA Tabs パターンのキーボード操作)。実装が持つ4分岐
// (ArrowRight/ArrowLeft/Home/End)をすべて通す。
//
// アサーションに toHaveBeenCalledWith ではなく toHaveBeenLastCalledWith を
// 使うのは、前者が「過去に一度でも呼ばれたか」を見るため、直前の操作の
// 呼び出しで条件が満たされてしまい、後続の操作が何もしなくてもテストが
// 通ってしまうのを避けるため。期待値は毎回直前と異なる値になるよう順序を
// 組んでおり、各操作が実際に発火したことを判別できる。
export const KeyboardNavigation: Story = {
  args: threeTabArgs,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const firstTab = canvas.getByTestId("view-mode-tab-priority");

    // ArrowRight: 隣接移動(index 0 → 1)。
    firstTab.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(args.onChange).toHaveBeenLastCalledWith("grouped");

    // ArrowLeft: 先頭タブで押すと末尾へ循環(index 0 → last)。
    // 実装は移動先へフォーカスも移すため、先頭へ戻してから押す。
    firstTab.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(args.onChange).toHaveBeenLastCalledWith("kanban");

    // Home: 先頭へ(末尾タブにフォーカスがある状態から)。
    await userEvent.keyboard("{Home}");
    await expect(args.onChange).toHaveBeenLastCalledWith("priority");

    // End: 末尾へ。
    await userEvent.keyboard("{End}");
    await expect(args.onChange).toHaveBeenLastCalledWith("kanban");
  },
};

// a11y チェックの観点(@storybook/addon-a11y が Story ごとに axe を実行するので、
// その結果とあわせて以下を目視で確認する):
// - role="tablist" / role="tab" / aria-selected / aria-controls が
//   WAI-ARIA Tabs パターンに沿って付与されているか
// - キーボード操作(矢印キー・Home・End)でマウス操作と同じ結果になるか
// - フォーカスリングがフォーカス可能な要素すべてに付与されているか
// - aria-label / aria-labelledby でコンポーネントの意味が伝わるか
```

#### import 元の 2 系統(混同しやすい)

| import するもの | import 元 |
|---|---|
| `Meta` / `StoryObj` / `Decorator` などの**型** | **`@storybook/nextjs-vite`**(フレームワークパッケージ) |
| `expect` / `fn` / `userEvent` / `within` | **`storybook/test`**(`storybook` パッケージのサブパス。`@storybook/test` ではない) |

型の実体は `@storybook/react` の再 export だが、**直接依存していないパッケージ名を書かない**ためフレームワーク側から import する。

#### 配置と `title` の命名規則

Story ファイルは**対象コンポーネントと同じディレクトリ**に `<Component>.stories.tsx` として置く(例: `src/components/ui/Button.stories.tsx`)。§4.3.6 のチェックがこの規約を前提にしている。

meta の `title` は `src` のディレクトリ構造をそのまま写す。第 1 階層に層(`Components` / `Containers`)、第 2 階層に `src/` 配下のディレクトリ名を対応させ、以降にコンポーネント名を続ける。

- `src/components/ui/Button.tsx` → `Components/UI/Button`
- `src/containers/TaskListContainer.tsx` → `Containers/TaskListContainer`

層(Container か Presentational / UI パーツか)と機能(どのディレクトリに属するか)という 2 つの軸を階層で分離しているため、`title` はディレクトリパスから機械的に決まり、命名に迷う余地がない。層をまたいで同名のコンポーネントが現れても衝突しない。

#### 同一ディレクトリのコンポーネントは相対 import

```tsx
// 同一ディレクトリの対象コンポーネントは、隣接する Button.test.tsx と同じく相対 import
// で参照する(テンプレートが `@/` を使っているのは、別ディレクトリの実在コンポーネントを
// 記入例として参照しているためである)。
import { Button } from "./Button";
```

#### `tags: ["autodocs"]` の付けどころ

`@storybook/addon-docs` が props テーブルと Story 一覧を含む docs ページを自動生成する。**広く再利用される UI パーツには付けておく**と参照先として役に立つ。すべてに付けると静的ビルドが重くなるので、Container のような 1 箇所でしか使わないものには付けない。

### 4.3.6 Story 網羅チェック

Story を書く前提を規約として書いておくだけでは漏れが積み上がる。**機械的なゲート**で止める。

```bash
pnpm check:stories   # 作業ツリーの現状を検査する
```

#### 検査の設計

| 性質 | 内容 |
|---|---|
| **全件整合を見る** | 「新規追加分だけ」ではなく対象ディレクトリの全ファイルを見る。**「宣言に無いコンポーネントは Story を持つ」という不変条件**が全件で成り立つことを保証する |
| **両方向を見る** | 実装 → 宣言(作り忘れ)と、宣言 → 実装(削除・改名したのに宣言が残る「腐り」)の両方 |
| **比較対象のコミットを取らない** | 作業ツリーの現状だけを見る。したがって CI では shallow な checkout のままで足り、引数も取らない |
| **検査不能は失敗にする** | 終了コード 0 = 漏れなし / 1 = 漏れ・不整合 / **2 = 検査不能**。列挙に失敗しただけなのに「該当 0 件 → 合格」と見なすと、ゲートが機能していないことに誰も気付かないまま PR が通る |
| **PR のときだけ実行する** | マージ済みの内容を今さら止めても漏れは防げない。ゲートは PR に一本化する(§2.6) |

#### 判定表

| Story ファイル | 除外宣言 | 判定 |
|---|---|---|
| ある | 一致しない | 合格 |
| 無い | 一致する | 合格(宣言済みの対象外) |
| 無い | 一致しない | **失敗** — Story の作り忘れ |
| (どのファイルにも一致しないパターン) | — | **失敗** — 削除・改名したのに宣言が残っている |

「宣言があるのに Story を持つ」を失敗にするかは、**宣言の意味づけ次第**である。

- 宣言が「Story を**持たなくてよい**」という**許可**なら → 失敗にしない(Story を書き足しても問題ない)
- 宣言が「Story を**作らない**」という**決定**なら → 失敗にする(Story を作ったら行を消す義務がある)

#### `.storybook/story-check-allowlist.txt`

```text
# Story チェック(scripts/check-stories.sh)の除外リスト
#
# ここに書いたパスは「Story を持たなくてよい」と宣言したものとして扱われる。
# 1行1パターン。リポジトリルートからの相対パスで書き、シェルのグロブが使える
# (`*` は `/` も含めてマッチする)。空行と `#` 以降はコメントとして無視される。
#
# 追記するときは、なぜ Story 化の対象外なのかを必ずコメントで残すこと。
# 「Story を書くのが面倒」は理由にならない。対象外にできるのは、Story として
# 提示できる見た目や状態を自身が持たないコンポーネントである。
# 判断に迷う場合は、除外ではなく Story を1本だけ書く(既定の状態を1つ提示する)方を選ぶ。
#
# 各パターンは対象ディレクトリ配下の実装ファイルに1件以上一致している必要がある。
# 対象を削除・改名してどのファイルにも一致しなくなった行は、宣言が腐ったものとして
# チェックが失敗させる。行を消すか、現在のファイル名に合わせて書き換えること。

# layout の Pane 系: Container を配置するだけのレイアウト骨格で、props を持たず
# 自身の見た目や状態がない。Storybook で提示すべき差分が存在しないため対象外とする。
# 個別列挙ではなくパターンで宣言しているのは、除外の根拠が個々のファイルではなく
# 「Pane = Container 合成専用」という命名規約そのものだからである。
src/components/layout/*Pane.tsx
```

**ファイルを個別に列挙せずパターンで宣言する**のが要点。除外の根拠が個々のファイルではなく命名規約そのものである場合、パターンで書けば規約に沿った新規ファイルが自動的に対象外になる。

#### `scripts/check-stories.sh`

```bash
#!/usr/bin/env bash
#
# Story(<Component>.stories.tsx)の有無を検査する。
#
#   TARGET_DIR     : 全件の整合を検査するディレクトリ
#   ALLOWLIST_FILE : 「Story を持たなくてよい」宣言(グロブのパターン)
#
# 使い方:
#   scripts/check-stories.sh    # 作業ツリーの現状を検査する(引数は取らない)
#
# 終了コード: 0 = 漏れなし / 1 = Story の漏れ・宣言との不整合 / 2 = 検査不能
#
set -euo pipefail

# 全件の整合を検査するディレクトリ。新規追加に限らないのは、配下のコンポーネントが
# 「Story を持つもの」と「allowlist で対象外を宣言したもの」に出揃っており、
# 「allowlist に無いコンポーネントは Story を持つ」という不変条件が全件について
# 成り立つためである。
readonly TARGET_DIR="src/components"

# Story 化の対象外を宣言する許可リスト。Storybook 周りの設定と同じ場所に置く。
readonly ALLOWLIST_FILE=".storybook/story-check-allowlist.txt"

readonly TEMPLATE_DIR=".storybook/templates"

# 許可リストのパターン。load_allowlist_patterns で読み込み、以降の判定が参照する。
declare -a ALLOWLIST_PATTERNS=()

usage() {
  cat <<'USAGE'
使い方: scripts/check-stories.sh

  対象ディレクトリの全件について、Story の有無と「Story を作らない」宣言の対応を
  検査する。作業ツリーの現状だけを見るため、比較対象のコミットは取らない
  (引数を与えるとエラーになる)。
USAGE
}

# 対象ディレクトリのファイルを再帰的に列挙する。ディレクトリごと消えている場合などは
# find が失敗するため、「0 件 → 合格」で素通りしない。列挙に失敗したときは非 0 を返し、
# 呼び出し側が「該当 0 件」と区別できるようにする(区別できないと、検査が成立していないのに
# ゲートを通してしまう)。パイプ左辺(find)の失敗も戻り値へ反映させるため、冒頭の
# set -o pipefail に依存している。
#
# git ではなくファイルシステムを見るのは、検査が作業ツリーの現状に対する全件整合であり、
# コミット履歴や比較対象を必要としないためである。
collect_component_files() {
  find "$TARGET_DIR" -type f -name '*.tsx' | sort
}

# Story を持つべきコンポーネントのファイルかを判定する。
# Story 自身とテストは対象外(Story を持つ主体ではない)。
# `*.integration.test.tsx` も `*.test.tsx` として弾かれる。
is_component_file() {
  case "$1" in
    *.stories.tsx | *.test.tsx) return 1 ;;
    *.tsx) return 0 ;;
    *) return 1 ;;
  esac
}

# 許可リストのパターンを1行1件で出力する。
# 各行の最初の空白区切りトークンをパターンとして読み、それ以降は行内コメントとして
# 捨てる。空行と # で始まる行も無視する。
read_allowlist_patterns() {
  [[ -f "$ALLOWLIST_FILE" ]] || return 0

  local pattern
  # ファイルを開けなかった場合は「除外指定なし」ではなく失敗として扱う。除外が
  # 読めていないのに検査を続けると、判定の前提が崩れたまま結果だけが出てしまう。
  #
  # `|| [[ -n "$pattern" ]]` が必要な理由: 末尾に改行のない最終行があると read は
  # 変数へ値を入れつつ非 0 を返すため、これが無いと最終行がループ本文に渡らず
  # サイレントに読み捨てられる(かつ while 全体の終了ステータスは 0 のままなので
  # `|| return 1` も発火しない = 除外指定が黙って無効化される)。
  while read -r pattern _ || [[ -n "$pattern" ]]; do
    [[ -z "$pattern" || "$pattern" == \#* ]] && continue
    printf '%s\n' "$pattern"
  done <"$ALLOWLIST_FILE" || return 1

  return 0
}

load_allowlist_patterns() {
  local patterns_text
  if ! patterns_text="$(read_allowlist_patterns)"; then
    return 1
  fi

  ALLOWLIST_PATTERNS=()
  [[ -n "$patterns_text" ]] || return 0
  mapfile -t ALLOWLIST_PATTERNS <<<"$patterns_text"
}

# 与えたパスが許可リストのいずれかのパターンに一致するかを判定する。
# パターンはシェルのグロブとして解釈する(`*` は `/` も含めてマッチする)。
is_allowlisted() {
  local path="$1"
  ((${#ALLOWLIST_PATTERNS[@]} == 0)) && return 1

  local pattern
  for pattern in "${ALLOWLIST_PATTERNS[@]}"; do
    # shellcheck disable=SC2053 # 右辺はグロブとして評価させたいのでクォートしない
    [[ "$path" == $pattern ]] && return 0
  done
  return 1
}

# 許可リストの1パターンについて、is_component_file の対象となる実装ファイル
# (第2引数以降に渡す)のいずれかに一致するかを判定する。パターンごとに独立して
# 全ファイルを走査するため、他のパターンが先に一致したかどうかには左右されない。
#
# 腐り検査に「最初に一致したパターン」を流用しないのはこのためである。流用すると、
# パターン同士に包含関係がある場合に広いパターンが先に一致を「取ってしまい」、
# そこに含まれるより具体的なパターンが実際にはファイルへ一致しているのに一度も
# 返されなかったものとして誤検出される。
allowlist_pattern_matches_any_file() {
  local pattern="$1"
  shift

  local path
  for path in "$@"; do
    is_component_file "$path" || continue
    # shellcheck disable=SC2053 # 右辺はグロブとして評価させたいのでクォートしない
    [[ "$path" == $pattern ]] && return 0
  done
  return 1
}

story_path_for() {
  printf '%s\n' "${1%.tsx}.stories.tsx"
}

report_missing() {
  local path
  echo "エラー: 対応する Story も除外宣言も無いコンポーネントがあります。" >&2
  for path in "$@"; do
    echo "  - $path -> $(story_path_for "$path") が必要です" >&2
  done
  cat >&2 <<MESSAGE

対処のいずれかを行ってください。
  1. Story を追加する: ${TEMPLATE_DIR}/ のテンプレートをコピーして書き始める
  2. Story 化の対象外なら ${ALLOWLIST_FILE} にパスを追記する
     (Container 合成専用など、対象外である理由をコメントで残すこと)
MESSAGE
}

report_stale_allowlist() {
  local pattern
  echo "エラー: どのコンポーネントにも一致しない除外宣言があります(削除・改名済み)。" >&2
  for pattern in "$@"; do
    echo "  - ${pattern} に一致する ${TARGET_DIR} 配下の実装ファイルがありません" >&2
  done
  cat >&2 <<MESSAGE

${ALLOWLIST_FILE} から該当行を削除するか、現在のファイル名に合わせて書き換えてください。
MESSAGE
}

# 全件について、Story の有無と除外宣言の対応を検査する。
# 「allowlist に無いコンポーネントは Story を持つ」という不変条件を両方向から確かめる。
# 0 = 整合 / 1 = 不整合 / 2 = 検査不能。
#
# 「宣言があるのに Story を持つ」は失敗にしない。allowlist の宣言は「Story を持たなくて
# よい」という許可であって「Story を作らない」という決定ではないためである。
check_components() {
  if ! load_allowlist_patterns; then
    echo "エラー: 許可リストを読み込めません: ${ALLOWLIST_FILE}" >&2
    return 2
  fi

  # 列挙結果をプロセス置換でループへ直接流すと、find が失敗しても終了ステータスが
  # 伝わらず「該当 0 件 → 合格」になってしまう(検査不能な状況でゲートが素通り
  # する)。いったん変数へ受け取り、成否を確かめてから処理する。
  local files_text
  if ! files_text="$(collect_component_files)"; then
    echo "エラー: コンポーネントを列挙できません: ${TARGET_DIR}" >&2
    return 2
  fi

  local -a component_files=()
  if [[ -n "$files_text" ]]; then
    mapfile -t component_files <<<"$files_text"
  fi

  local -a missing=() stale=()
  local path pattern

  # 実装ファイル → 宣言の向き。宣言に一致しなければ Story が要る。
  for path in "${component_files[@]}"; do
    is_component_file "$path" || continue
    is_allowlisted "$path" && continue
    [[ -f "$(story_path_for "$path")" ]] && continue
    missing+=("$path")
  done

  # 宣言 → 実装ファイルの向き。宣言だけが残って腐るのを防ぐ。パターンごとに
  # 「一致する実装ファイルが1つでもあるか」を独立に判定する。
  for pattern in "${ALLOWLIST_PATTERNS[@]}"; do
    allowlist_pattern_matches_any_file "$pattern" "${component_files[@]}" || stale+=("$pattern")
  done

  local status=0
  if ((${#missing[@]} > 0)); then
    report_missing "${missing[@]}"
    status=1
  fi
  if ((${#stale[@]} > 0)); then
    report_stale_allowlist "${stale[@]}"
    status=1
  fi
  ((status == 0)) || return "$status"

  echo "Story チェック(${TARGET_DIR}): Story と除外宣言は全件整合しています。"
}

main() {
  # 相対パス(TARGET_DIR / ALLOWLIST_FILE)を解釈できるよう、実行位置に依存させない。
  # git を使うのはこの1点だけで、検査そのものは作業ツリーのファイルだけを見る。
  local repo_root
  repo_root="$(git rev-parse --show-toplevel)" || return 2
  cd "$repo_root"

  check_components
}

case "${1-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac

# 引数は取らない。比較対象のコミットを必要としない全件検査だからである。黙って無視すると
# 「指定した範囲だけを検査した」と誤解されるため、検査不能として弾く。
if (($# > 0)); then
  usage >&2
  exit 2
fi

main
```

#### Story を作らないと判断するときの 4 観点

除外を宣言するときは、次のいずれの観点に当たるのかと、その具体的な理由を書く。**「Story を書くのが面倒」は理由にならない。**

| 観点 | 内容 |
|---|---|
| **描画を持たない** | `children` をそのまま返す pass-through や、Provider で包むだけで自前の DOM を出さないもの。Story にしても空の枠しか出ない |
| **上位 Container の Story に含まれる** | 実アプリと同じ組み合わせで既に描画されており、単体の Story を足しても同じ絵が増えるだけになる |
| **Presentational の Story と同じ絵になる** | Container 固有の結線が無く、Presentational 側が args で作れる状態しか出せない |
| **技術的制約** | デコレータでは必要な Context を用意できない、あるいは `play` が実ブラウザで止まる副作用(OS のファイル選択ダイアログを開くなど)を起こす |

**見送りに至った検討の経緯(比較した案と採らなかった理由)は宣言に書かず、その行を追加したコミットのメッセージに残す。** 宣言には現時点の結論だけを置き、経緯は `git blame` → コミットで辿る。

> **宣言先を複数に分ける選択肢もある。** 対象ディレクトリごとに「宣言に求めるもの」が違う場合(例: 命名規約に対するパターン宣言で足りる層と、1 件ずつ観点と理由を散文で読ませたい層)、後者は Markdown の表を情報源にする構成が採れる。ただし **Markdown の表のパースは書式変更で容易に壊れる**ため、読めなかったときは「宣言 0 件」と解釈せず**検査不能(終了コード 2)で止める**実装にすること。新規プロジェクトでは、まず allowlist 1 本で始めるのが単純で壊れにくい。

### 4.3.7 a11y テストを CI で落とす運用

`@storybook/addon-a11y` は Story を開くと axe による自動チェックを走らせ、違反を Accessibility パネルに表示する。**これだけでは退行を止められない**(誰も見ないパネルに出るだけ)。

#### 3 段階で CI のゲートにする

1. **`preview.tsx` で `parameters.a11y.test: "error"` を設定する。**
   アドオン既定の `"todo"` は違反を警告に留めるので、CI に組み込んでも退行を止められない。
2. **`@storybook/addon-vitest` により `pnpm test:storybook` で axe が実行される。**
   Story ごとに 1 テストとして扱われ、違反があればテストが失敗する。
3. **CI の `storybook-test` ジョブで `pnpm test:storybook` を回す**(§2.6)。これでマージがブロックされる。

#### `"error"` にできるのは違反ゼロのときだけ

**立ち上げ時点で全 Story が違反ゼロなら、最初から `"error"` にする。** 既存プロジェクトに後付けする場合は違反が大量に出るので、次の順で移行する。

1. まず `"todo"` のまま `pnpm test:storybook` を回し、違反の件数と内訳を把握する。
2. 違反を潰す。潰しきれないものは**その Story の `parameters.a11y` でルールを限定して無効化**する。
3. 全体が通るようになったら `preview.tsx` を `"error"` に切り替える。

**preview 全体を緩めない**のが要点。一度緩めると「どの Story のどのルールが例外なのか」が追えなくなり、新規の違反も混入し放題になる。

```tsx
// 個別 Story での例外(preview 全体は "error" のまま)
export const LegacyWidget: Story = {
  args: { /* ... */ },
  parameters: {
    a11y: {
      config: {
        // 対象のルールだけを無効化し、理由をコメントで残す。
        rules: [{ id: "color-contrast", enabled: false }],
      },
    },
  },
};
```

#### 自動チェックで拾えない観点

axe は静的な DOM しか見ない。次はテンプレート末尾のコメント(§4.3.5)に列挙し、Story を書くときに目視で確認する。

- キーボード操作(矢印キー・Home・End・Tab)でマウス操作と同じ結果になるか
- フォーカスの移動先が妥当か(要素が非活性化した瞬間にフォーカスが `body` へ落ちていないか)
- `aria-label` / `aria-labelledby` がコンポーネントの意味を伝えているか
- フォーカスリングがフォーカス可能な要素すべてに付与されているか

これらは `play` 関数で検証できるものもある(キーボード操作の結果は §4.3.5 の `KeyboardNavigation` が実例)。

---

## 4.4 Playwright

### 4.4.1 導入手順

```bash
# コンテナ内で実行する
pnpm add -D @playwright/test playwright serve

# ブラウザバイナリの取得(初回のみ。--with-deps は不要 — §2.2)
pnpm exec playwright install chromium
```

`playwright.config.ts` を手で書く(`init` の対話は使わず、§4.4.2 の内容をコピーする)。あわせて次を整える。

1. `e2e/` ディレクトリを作り、`helpers.ts` と `*.spec.ts` を置く。
2. `biome.json` の `files.includes` に `e2e/**/*.ts` と、出力ディレクトリの除外を追加する(§3.5)。
3. `vitest.config.ts` の `unit` project に `exclude: [..., "e2e/**"]` を追加する(§4.2)。**これを忘れると Vitest が Playwright のスペックを拾って壊れる。**
4. `.gitignore` に次を追加する。

   ```text
   # Playwright
   /test-results/
   /playwright-report/
   /blob-report/
   ```

5. `package.json` に `test:e2e` / `test:e2e:only` / `serve:out` を追加する(§3.1)。

### 4.4.2 `playwright.config.ts`

```typescript
import { defineConfig, devices } from "@playwright/test";

// 開発サーバー(3000)と衝突しないポートで `out/` (Static Export) を配信する。
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm serve:out",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
```

| 設定 | 意図 |
|---|---|
| `fullyParallel: true` | スペックファイル内のテストも並列化する。**テスト間で状態を共有しない**設計を強制する効果がある |
| `forbidOnly: !!process.env.CI` | `test.only` の消し忘れを CI で落とす。ローカルでは絞り込みに使いたいので CI 限定 |
| `retries: process.env.CI ? 2 : 0` | CI の実行環境は描画が遅くフレークしやすい。ローカルは 0 にしてフレークを隠さない |
| `trace: "on-first-retry"` | 常時取得は重い。失敗して初回リトライに入ったときだけトレースを残す |
| `screenshot: "only-on-failure"` | 失敗時の画面を残す。CI では `actions/upload-artifact` で回収する(§2.6) |
| `reuseExistingServer: !process.env.CI` | ローカルで既に `pnpm serve:out` を立てているならそれを使う。CI では必ず新規起動し、古いプロセスの残骸を掴まないようにする |
| `projects` は chromium のみ | ブラウザを増やすと CI 時間が線形に伸びる。クロスブラウザが要件なら増やすが、既定では 1 つに絞る |

### 4.4.3 Static Export を `serve` で配信する理由

**`next dev` や `next start` ではなく、`next build` が吐いた `out/` を静的配信して検証する。**

| 理由 | 内容 |
|---|---|
| **本番と同じ成果物を検証できる** | `output: "export"` の成果物でしか出ない破綻(アセットのパス、`trailingSlash` の扱い、`next/image` の `unoptimized` 前提、動的ルートの静的化漏れ)は dev サーバーでは再現しない |
| **`next start` は Static Export では使えない** | `output: "export"` の場合、`next start` は本来のサーバー機能を持たない。静的ファイルサーバーで配信するのが正しい |
| **起動が速く、状態を持たない** | HMR もコンパイルも走らないので、テストの待ち時間とフレークが減る |
| **CI と開発で同じ経路になる** | `webServer.command` が両方で同じ `pnpm serve:out` を呼ぶ |

**`test:e2e` が `next build && playwright test` になっているのが要点。** ビルドを省くと、`out/` が古いままの成果物を検証してしまい、「直したはずのバグが再現する」「消したはずの画面が出る」といった混乱を招く。ビルド済みであることが確実な場面(直前に `pnpm build` した、CI の同一ジョブ内で既にビルドしている)だけ `test:e2e:only` を使う。

```jsonc
"test:e2e": "next build && playwright test",   // 既定。必ずビルドしてから
"test:e2e:only": "playwright test",            // ビルド済みが確実なときだけ
"serve:out": "serve out -l 4173"               // webServer から呼ばれる
```

**ポート 4173 は開発サーバー(3000)と Storybook(6006)のどちらとも衝突しない値**を選んである。3 つを同時に立てられることが前提。

### 4.4.4 `e2e/helpers.ts` の設計

E2E スペックが増えると、同じ操作手順(モーダルを開いて確認ボタンを押す、フォームに入力して送信する)がコピーされ始める。これを共有ヘルパーに集約するかどうかの**線引き**を最初に決めておく。

#### 線引き: 「複数スペックで共有するものだけ」を集約する

```typescript
import { expect, type Locator, type Page } from "@playwright/test";

// 複数の e2e スペックで共有するヘルパー群。
// 1ファイルでしか使わない補助関数は、過剰な抽象化を避けるためここには集約せず、
// 各スペック側に残置している。
```

**1 ファイルでしか使わない補助関数を `helpers.ts` に上げない。** 上げると次の害がある。

- ヘルパーを読んだだけでは、それがどのシナリオのためのものか分からなくなる
- 唯一の呼び出し元を変更するときに、共有ファイルを触ることになり差分の影響範囲が広く見える
- 「共有ヘルパーだから壊せない」という心理的な制約が、実際には 1 箇所からしか呼ばれていないのに発生する

逆に、2 つ目のスペックから同じ手順を呼びたくなった時点で `helpers.ts` へ引き上げる。

#### ヘルパーの種類は 2 つに分ける

| 種類 | 戻り値 | 例 |
|---|---|---|
| **Locator を返すもの** | `Locator` | 特定の領域・行を指す。呼び出し側が `expect` を組み立てる |
| **操作を行うもの** | `Promise<void>` | 「ボタン押下 → 確認ダイアログ → 確定」までの一連の手順を実行する |

混ぜない。Locator を返す関数の中で操作をすると、`expect(...)` に渡した瞬間に副作用が走るような読みにくいコードになる。

```typescript
// Locator を返す例。呼び出し側が expect を組み立てる。
export function pendingArea(page: Page): Locator {
  return page.getByTestId("pending-area");
}

// 一覧から特定の行を返す例。
// exact: true を付け、別の一覧(部分一致してしまう aria-label を持つもの)への
// 誤マッチを防ぐ。
export function mainTaskRow(page: Page, title: string): Locator {
  return page
    .getByRole("list", { name: "タスク一覧", exact: true })
    .locator("li")
    .filter({ hasText: title });
}
```

#### 責務の境界を明記する

ヘルパーが**どこまでやるか**をコメントで宣言する。曖昧なままだと、呼び出し側とヘルパーの両方で同じ前処理をしたり、どちらもしなかったりする。

```typescript
// アップロードボタン押下 → 確認ダイアログの OK → ファイル選択、までを行う。
// フィクスチャパスの解決(テスト用ディレクトリからの相対パス変換など)は呼び出し側の責務とする。
export async function uploadFile(page: Page, filePath: string): Promise<void> {
  // ...
}
```

#### 確定前にアサーションを挟みたい場合はコールバックを受ける

「確認ダイアログのプレビュー内容を確かめてから確定したい」というスペックが出てきたとき、ヘルパーを 2 つに割らずオプション引数で差し込む。

```typescript
// ボタンのクリック → 確認ダイアログで確定、までを行う。
// beforeConfirm を渡すと、ダイアログの表示を待ってから・確定クリック前に実行する
// (確定前のプレビュー内容を確認したい場合用)。
export async function confirmAction(
  page: Page,
  beforeConfirm?: () => Promise<void>,
): Promise<void> {
  await page.getByTestId("action-button").click();
  const dialog = page.getByRole("dialog", { name: "実行しますか?" });
  await expect(dialog).toBeVisible();
  if (beforeConfirm) await beforeConfirm();
  await dialog.getByRole("button", { name: "実行する" }).click();
  await expect(dialog).not.toBeVisible();
}
```

**ヘルパーの適用外になる特殊ケースがあるなら、それも書いておく。** 「このヘルパーは通常経路用で、特殊な操作を挟むシナリオは対象外」と明記すれば、無理に使おうとして壊れることを防げる。

#### リトライを内蔵するヘルパーには前提条件を書く

リトライは**冪等な操作にしか使えない**。回復不能状態に陥る可能性がある場合、その条件と回避方法をコメントで残す。

```typescript
// 直前の操作の影響で稀にクリックが握りつぶされる経路があるため、リトライで包む。
//
// リトライ時の注意: 1回目のクリックが成立していて effect の表示が遅いだけの場合、
// 再度 click() すると、表示済みの effect(モーダル等)の overlay に阻まれてクリックが
// 届かず、以降どのリトライでも成功しない回復不能状態に陥る。そのため再クリック前に
// 必ず effect の可視性を確認し、既に見えていれば何もせず抜ける。
// このヘルパーは locator のクリックが冪等な操作である場合にのみ使うこと
// (再クリックしても副作用が増えない前提)。
//
// タイムアウトの根拠: click 自体と effect 表示待ちの timeout は、抑止窓 + CI 描画遅延への
// 安全マージンとして 1000ms を設定。リトライ総枠は toPass の timeout で 5000ms とする。
export async function clickWithRetry(locator: Locator, effect: Locator): Promise<void> {
  await expect(async () => {
    if (await effect.isVisible()) return;
    await locator.click({ timeout: 1000 });
    await expect(effect).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
}
```

**タイムアウト値には必ず根拠を書く。** 根拠のない数値は、フレークするたびに誰かが倍にしていき、最終的にテスト全体が遅くなる。

#### スペック本体はヘルパーを組み合わせるだけにする

```typescript
import { expect, test } from "@playwright/test";

// スモークテスト: Static Export された `out/` を `serve` で配信し、
// 最低限の画面遷移が壊れていないことを確認する。

test("/ が表示される", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "<PROJECT>", level: 1 })).toBeVisible();
});

test("ヘッダーの「ヘルプ」から /help へ遷移する", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "ヘルプ" }).click();

  await expect(page).toHaveURL(/\/help/);
  await expect(page.getByRole("heading", { name: "使い方", level: 1 })).toBeVisible();
});
```

**ロケータは `getByRole` を第一選択にする。** `getByTestId` は role で一意に指せない場合の代替であり、多用するとアクセシビリティ上の問題(role やラベルが付いていない)を隠してしまう。

### 4.4.5 落とし穴

| 症状 | 原因 / 対処 |
|---|---|
| `Executable doesn't exist` | ブラウザバイナリ未取得。`pnpm exec playwright install chromium`。バイナリは `node_modules` の外(`~/.cache/ms-playwright`)に置かれるため `pnpm install` では取得されず、コンテナを作り直すと消える(§2.3) |
| 直したはずのバグが再現する | `out/` が古い。`test:e2e:only` ではなく `test:e2e`(`next build &&` 付き)を使う(§4.4.3) |
| ポート 4173 が塞がっている | 前回の `serve` が残っている。ローカルは `reuseExistingServer: true` なので再利用されるが、別の内容を配信していると混乱する。`docker compose restart app` か、プロセスを落としてから再実行する |
| Vitest が `*.spec.ts` を拾って壊れる | `vitest.config.ts` の `unit` project に `exclude: [..., "e2e/**"]` が無い(§4.2) |
| Dockerfile と `@playwright/test` のバージョンがずれる | `install-deps` が入れる OS ライブラリの一覧はバージョンで変わりうる。Dependabot は npm と docker を別エコシステムとして扱うので自動追随しない(§5.6) |
| ドラッグ&ドロップ直後のクリックが握りつぶされる | 一部の DnD ライブラリは、ドロップ完了後の一定時間 `document` 全体でクリックを `stopPropagation` する(ドロップ位置での意図しないクリックを防ぐ仕組み)。リトライで包むが、**冪等性の前提と回復不能状態の回避**を必ず実装する(§4.4.4) |
| jsdom では通るのに実ブラウザで落ちる(またはその逆) | jsdom は `getBoundingClientRect` が 0 を返すため、座標ベースの衝突判定が成立しない。**座標に依存する挙動は実ブラウザ(Story テストか E2E)で検証する**。逆に、`fireEvent` の戻り値でしか判定できない挙動は jsdom 側でしか書けない |
| CI だけフレークする | `retries: 2` で吸収されているだけの場合がある。`playwright-report` のトレース(`trace: "on-first-retry"`)を artifact から回収して原因を見る。**リトライ回数を増やして黙らせない** |
| `page.goto("/")` が 404 になる | `baseURL` と `serve` のポートがずれている、または `out/` が生成されていない。`webServer.url` と `use.baseURL` は同じ定数から組み立てる(§4.4.2) |

---

## 4.5 fast-check(プロパティベーステスト)の位置付け

**`fast-check` は unit 層(jsdom / Vitest)専用**である。Story テストにも E2E にも持ち込まない。

| 層 | PBT の適用 | 理由 |
|---|---|---|
| unit | **積極的に採用する** | 1 ケースの実行が数マイクロ秒なので、数百ケースを走らせても現実的な時間で終わる |
| storybook(`play`) | 採用しない | 実ブラウザでの描画・操作は 1 ケース数百ミリ秒。ランダム生成で回すには遅すぎる。加えて Story は「提示する状態」であり、ランダムな状態は提示物にならない |
| E2E | 採用しない | 同上。さらに失敗時の再現(seed からの復元)が、ビルド成果物の配信を挟む分だけ難しい |

### PBT が効くロジックの見分け方

| 効く | 効かない |
|---|---|
| 入出力が値で閉じている純粋関数 | DOM やネットワークに触る関数 |
| **不変条件**を言葉で書ける(「ソート後は必ず昇順」「reducer をどう適用しても ID は重複しない」) | 期待値を 1 つずつ列挙するしかないもの |
| **往復性**がある(`parse(serialize(x)) === x`) | 出力が仕様書の表と 1:1 対応するだけのもの |
| 入力空間が広く、境界値を人手で数え上げにくい | 入力が有限個の enum |

### 書き方

```typescript
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { reorder } from "./reorder";

describe("reorder", () => {
  // 例示ベースのテストは残す。PBT は例示テストの置き換えではなく上乗せである。
  // 具体例は仕様の読み物として機能し、PBT は列挙しきれない入力を潰す。
  it("先頭要素を末尾へ移動できる", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  // 不変条件: 並び替えは要素の集合を変えない。
  it("要素の多重集合は保存される", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.nat(),
        fc.nat(),
        (items, from, to) => {
          if (items.length === 0) return true;
          const result = reorder(items, from % items.length, to % items.length);
          expect([...result].sort()).toEqual([...items].sort());
          return true;
        },
      ),
    );
  });
});
```

**外部からの入力を受ける処理(公開 API・ハンドラ・パーサ・設定読込など)では、不正な入力値への振る舞いも設計に含める。** `null` / `undefined` / `NaN` / 空文字 / 型違い / 範囲外の数値 / 未知の enum 値のそれぞれに対して、どう振る舞うか(例外か、既定値へのフォールバックか、`Result` 型で返すか)を決め、その振る舞いを検証するテストを書く。PBT の arbitrary にこれらを混ぜられる場合(`fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined))` など)は混ぜると網羅性が上がる。

---

## 5. バージョン最新化の手順

> **この資料のバージョン番号(§5.7 のベースライン表)は 2026年9月時点の参考値。** 構築直前に必ず再取得すること。

### 5.1 npm パッケージの最新安定版

ホストに Node を入れない方針なので、調査もコンテナ経由か、registry 直参照で行う。

```bash
# コンテナ内 / CI で(npm registry の latest タグ)
npm view <pkg> version

# 例
npm view pnpm version
npm view next version
npm view @biomejs/biome version
npm view typescript version
npm view vitest version
npm view storybook version
npm view @playwright/test version
```

ネットワーク制限環境では registry を直接参照:
`https://registry.npmjs.org/<pkg>/latest` の `version` フィールドを見る。

**バージョンを揃える必要があるグループ**(§3.1 の表を再掲)は、代表 1 つを調べてグループ全体に適用する。

| グループ | 代表として調べるもの |
|---|---|
| `storybook` / `@storybook/nextjs-vite` / `@storybook/addon-*` | `npm view storybook version` |
| `@playwright/test` / `playwright` / Dockerfile の `install-deps` | `npm view @playwright/test version` |
| `vitest` / `@vitest/ui` / `@vitest/browser-playwright` | `npm view vitest version` |

### 5.2 Node.js のバージョン選定

- **開発コンテナ(Dockerfile の `FROM`)**: 最新の安定系を使ってよい(Current 系)。
- **CI / 実行ターゲット**: **Active LTS** を推奨。
- LTS の確認: `https://nodejs.org/en/about/previous-releases`(スケジュール)/ `https://nodejs.org/dist/index.json`(全リリース)。
- 開発と CI で Node メジャーを揃えるか分けるかは、プロジェクトの実行ターゲットに合わせて決める(§2.6 の注記)。
- **Node 25 以降は corepack が本体同梱でない** → Dockerfile で `npm install -g corepack@<VER>` が必要(§2.2)。

### 5.3 corepack のバージョン

```bash
npm view corepack version
```

Dockerfile の `corepack@<COREPACK_VER>` を更新。ビルド再現性のため固定する(範囲指定にしない)。

### 5.4 GitHub Actions の SHA pin

タグはミュータブルなので、サプライチェーン保護のため **コミット SHA で固定**し、行末にタグをコメントする。

```bash
# 最新タグの確認(リリースページ)
#   https://github.com/actions/checkout/releases
#   https://github.com/actions/setup-node/releases
#   https://github.com/actions/cache/releases
#   https://github.com/actions/upload-artifact/releases
#   https://github.com/pnpm/action-setup/releases

# タグ → コミット SHA(最も確実)
git ls-remote https://github.com/actions/checkout v7.0.1

# または gh CLI(軽量タグの場合)
gh api repos/actions/checkout/git/refs/tags/v7.0.1 --jq '.object.sha'
```

ワークフローには `uses: actions/checkout@<40桁SHA> # v7.0.1` の形で書く。
以後は Dependabot(`github-actions`)が SHA pin のまま更新 PR を出す。

**このガイドの CI で使う Action は 5 つ**: `actions/checkout` / `actions/setup-node` / `actions/cache` / `actions/upload-artifact` / `pnpm/action-setup`。テスト層を持つ分、`cache` と `upload-artifact` が増えている。

### 5.5 devcontainer features の更新

features は OCI イメージ(ghcr.io)。`:1`(メジャー)固定でも動くが、digest pin が望ましい。

```bash
# 最新一覧
#   https://containers.dev/features
# digest 取得
docker buildx imagetools inspect ghcr.io/devcontainers/features/github-cli:1
```

`devcontainer-lock.json` が VSCode 接続時に自動生成・更新される。

### 5.6 Playwright のバージョン整合

Playwright のバージョンは **3 箇所**に現れる。**Dependabot は npm と docker を別エコシステムとして扱うため、自動では揃わない。**

| 箇所 | 何が書かれるか | 更新方法 |
|---|---|---|
| `package.json` の `@playwright/test` / `playwright` | ライブラリ本体 | Dependabot(npm)が PR を出す |
| `docker/Dockerfile` の `npx -y playwright@<VER> install-deps chromium` | OS 依存ライブラリの導入元 | **手動**。Dependabot(docker)は `FROM` しか見ない |
| `.github/workflows/ci.yml` の `pnpm exec playwright install --with-deps chromium` | CI でのブラウザ取得 | バージョンを書いていないので自動追随する |

**Playwright を上げる PR では必ず Dockerfile も合わせる。** ずれると、イメージに入っている OS ライブラリが新しい Chromium の要求を満たさず、コンテナ内でだけ Story テストと E2E が起動に失敗する(CI では `--with-deps` が毎回入れ直すので通ってしまい、気付きにくい)。

**チェック方法**:

```bash
# package.json の宣言値
node -p "require('./package.json').devDependencies['@playwright/test']"

# Dockerfile に書いてある値
grep -o 'playwright@[0-9.]*' docker/Dockerfile
```

> Dockerfile 側を `package.json` から動的に読む(`COPY package.json` してから `npx playwright@$(node -p ...)`)構成も取れるが、レイヤキャッシュが `package.json` の任意の変更で無効化されるためビルドが遅くなる。**手動で揃えて §7 の落とし穴表に載せる**ほうを既定にしている。

### 5.7 参考ベースライン(2026年9月時点)

> **そのままコピーせず、必ず §5.1〜5.6 で再取得した値で上書きすること。**
> 下表は参考プロジェクト(diary-task)の現行値である。日付は **2026-09** 時点。

| プレースホルダ | コンポーネント | 参考値 | 備考 |
|---|---|---|---|
| `<NODE_MAJOR>` | Node.js(開発コンテナ) | `26`(`node:26-bookworm-slim`) | Current 系 |
| `<NODE_LTS_MAJOR>` | Node.js(CI) | `24` | Active LTS。実行ターゲットに合わせる |
| `<PNPM_VER>` | pnpm | `10.30.0` | `package.json` の `packageManager` が唯一のソース |
| `<COREPACK_VER>` | corepack | `0.35.0` | Dockerfile で固定 |
| `<NEXT_VER>` | Next.js | `16.2.12` | |
| `<REACT_VER>` | React / react-dom | `19.2.8` | |
| `<TAILWIND_VER>` | tailwindcss / @tailwindcss/postcss | `~4.3.2` | v4 系(CSS-first) |
| — | @tailwindcss/typography | `~0.5.20` | Markdown 表示を使う場合 |
| `<BIOME_VER>` | @biomejs/biome | `2.5.9` | `biome.json` の `$schema` URL も更新 |
| `<TS_VER>` | TypeScript | `~6.0.3` | |
| `<TYPES_NODE_VER>` | @types/node | `~26.1.1` | Node メジャーに追随 |
| `<TYPES_REACT_VER>` | @types/react | `~19.2.18` | |
| `<TYPES_REACT_DOM_VER>` | @types/react-dom | `~19.2.3` | |
| `<VITEST_VER>` | vitest / @vitest/ui / @vitest/browser-playwright | `~4.1.10` | **3 つ揃える** |
| `<VITE_VER>` | vite | `~8.2.0` | Storybook の Vite ビルダーが要求 |
| `<PLUGIN_REACT_VER>` | @vitejs/plugin-react | `~6.0.3` | `unit` project 用 |
| `<JSDOM_VER>` | jsdom | `~29.1.1` | |
| `<TL_REACT_VER>` | @testing-library/react | `~16.3.2` | |
| `<TL_DOM_VER>` | @testing-library/dom | `~10.4.1` | |
| `<TL_JEST_DOM_VER>` | @testing-library/jest-dom | `~7.0.1` | |
| `<TL_USER_EVENT_VER>` | @testing-library/user-event | `~14.6.1` | |
| `<FASTCHECK_VER>` | fast-check | `~4.9.0` | PBT 用(§4.5) |
| `<STORYBOOK_VER>` | storybook / @storybook/nextjs-vite / addon-a11y / addon-docs / addon-vitest | `~10.5.6` | **5 つすべて揃える** |
| `<PLAYWRIGHT_VER>` | @playwright/test / playwright / Dockerfile の `install-deps` | `~1.62.1` | **3 箇所揃える**(§5.6) |
| `<SERVE_VER>` | serve | `~14.2.6` | Static Export の配信用(§4.4.3) |
| — | zod | `~4.4.3` | アプリ層・必要時 |
| `<SHA>` | actions/checkout | `3d3c42e5aac5ba805825da76410c181273ba90b1` # v7.0.1 | SHA pin(§5.4) |
| `<SHA>` | actions/setup-node | `820762786026740c76f36085b0efc47a31fe5020` # v7.0.0 | SHA pin |
| `<SHA>` | actions/cache | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` # v6.1.0 | SHA pin |
| `<SHA>` | actions/upload-artifact | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` # v7.0.1 | SHA pin |
| `<SHA>` | pnpm/action-setup | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` # v6 | SHA pin |
| — | devcontainer features (git / github-cli) | `:1` | digest pin 推奨(§5.5) |

**バージョン指定の書き方**: 上表の `~` は「パッチのみ許可」を意味する。`next` / `react` / `react-dom` / `@biomejs/biome` は完全固定(範囲指定なし)にしてある。テスト層のパッケージは相互のバージョン整合が要るので、`^`(マイナーまで許可)は避けて `~` か完全固定にするのが安全である。

---

## 6. セットアップ手順(チェックリスト)

新規プロジェクトで上から順に実行する。

1. [ ] リポジトリ作成。`<PROJECT>` 名と `/<PROJECT>` パスを決める。
2. [ ] §5 で各ツールの最新安定版を調べ、採用バージョンを確定する。**揃えるべきグループ(§5.1 の表)に注意。**
3. [ ] **第1部のファイルを配置**(`<PROJECT>` / `<NODE_MAJOR>` / `<COREPACK_VER>` / `<PLAYWRIGHT_VER>` を置換):
   - [ ] `docker/Dockerfile`(§2.2。**`playwright install-deps` を消さない**)
   - [ ] `docker-compose.yml`(§2.3。ポート 3000 / `127.0.0.1:6006`)
   - [ ] `.devcontainer/devcontainer.json`(§2.4)
   - [ ] `pnpm-workspace.yaml`(§2.5)
   - [ ] `.github/workflows/ci.yml`(§2.6。**3 ジョブ**)、`.github/workflows/audit.yml`、`.github/dependabot.yml`
4. [ ] **第2部のファイルを配置 or 差し替え**(アプリ層): `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `biome.json`
   - [ ] `tsconfig.json` の `include` に `.storybook/**` を追加したか(§3.3)
   - [ ] `biome.json` の `files.includes` に `.storybook/**` と `e2e/**` を追加したか(§3.5)
5. [ ] **第3部のテスト層を配置**:
   - [ ] `vitest.config.ts`(**2 project**)/ `vitest.setup.ts`(§4.2)
   - [ ] Storybook: `pnpm dlx storybook@latest init` → `.storybook/main.ts` / `.storybook/preview.tsx` を §4.3.2 / §4.3.3 の内容に置換 → スキャフォールドのサンプル Story を削除(§4.3.1)
   - [ ] `.storybook/templates/display.stories.tsx` / `input.stories.tsx`(§4.3.5)
   - [ ] `.storybook/story-check-allowlist.txt` / `scripts/check-stories.sh`(§4.3.6)
   - [ ] Playwright: `playwright.config.ts` / `e2e/helpers.ts` / `e2e/smoke.spec.ts`(§4.4)
   - [ ] `.gitignore` に `storybook-static` / `*storybook.log` / `/test-results/` / `/playwright-report/` / `/blob-report/` を追加
6. [ ] GitHub Actions を SHA pin に更新(§5.4)。
7. [ ] 初回ビルド&起動: `docker compose up -d --build` → `http://localhost:3000` を確認。
   - VSCode 派は `Dev Containers: Reopen in Container` →(必要なら)`pnpm dev`。
8. [ ] **ブラウザバイナリを取得**: `docker compose exec app pnpm exec playwright install chromium`(§2.2。`--with-deps` は不要)
9. [ ] 動作確認(すべてコンテナ内 / `docker compose run --rm app` 経由):
   - [ ] `pnpm check:ci` / `pnpm type-check`
   - [ ] `pnpm test`(unit)
   - [ ] `pnpm build`(Static Export)
   - [ ] `pnpm build-storybook`
   - [ ] `pnpm storybook` → `http://localhost:6006` が開く
   - [ ] `pnpm test:storybook`(実ブラウザ)
   - [ ] `pnpm test:e2e`(ビルド → 配信 → シナリオ)
   - [ ] `pnpm check:stories`
10. [ ] `README.md` と `CLAUDE.md` をプロジェクトに合わせて作成(本ガイドの内容を要約)。
11. [ ] **PR は必ず Draft で作成**(運用ルール)。新規ブランチに upstream は設定しない。

---

## 7. 既知の落とし穴(まとめ表)

| # | 症状 | 原因 / 対処 |
|---|------|------------|
| 1 | `pnpm build` で `<Html> should not be imported` | `docker-compose.yml` の `environment:` に `NODE_ENV` を設定している。**削除**する(§2.3)。 |
| 2 | bind mount したソースが root 所有で書けない | ホスト/コンテナの UID 不一致。ホスト側は `sudo chown -R "$(id -u):$(id -g)" .`、コンテナ内は `docker compose exec -u root app chown -R node:node /<PROJECT>`(Docker の権限で root exec)。 |
| 3 | named volume が root 所有で初期化され書けない | Dockerfile で `mkdir` + `chown` を先に行う(§2.2)。 |
| 4 | corepack 起動時にハング | `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` を消さない(`tty: true` 環境)(§2.2)。 |
| 5 | ベースイメージが落とせない | `FROM` を一時的に `node:<NODE_MAJOR>-slim` や `node:lts-bookworm-slim` に置換して再ビルド。 |
| 6 | pnpm のバージョンを変えたい | Dockerfile ではなく **`package.json` の `packageManager`** を書き換えて再ビルド(唯一のソース)(§2.2)。 |
| 7 | `pnpm test:storybook` が `Executable doesn't exist` で失敗する | Playwright のブラウザバイナリが未取得。`pnpm exec playwright install chromium` を実行する。バイナリは `node_modules` の**外**(`~/.cache/ms-playwright`)に置かれるため、**`pnpm install` では取得されず**、イメージにも焼き込んでいないので**コンテナを作り直すと消える**(§2.2 / §2.3)。なお `pnpm test`(単体テスト)はブラウザを使わないのでこの状態でも動く。 |
| 8 | Story にスタイル(Tailwind)が当たらない | `.storybook/preview.tsx` 冒頭の `import "../src/app/globals.css";` が消えていないか確認する。Storybook は `src/app/layout.tsx` を経由しないため、**この import が唯一のスタイル読み込み経路**である(§4.3.3)。 |
| 9 | Story テストがフレークする(`optimized dependencies changed. reloading` / `Vite unexpectedly reloaded a test`) | 依存最適化のキャッシュを消して再実行する。**`node_modules/.vite` だけでは足りない** — Story テストのキャッシュは `@storybook/addon-vitest` が `cacheDir` を独自指定しているため `node_modules/.cache/storybook/<version>/<hash>/sb-vitest/deps/` に置かれる。`rm -rf node_modules/.vite node_modules/.cache/storybook && pnpm test:storybook`。消して再現しないなら `optimizeDeps.include` への追記は不要(§4.2)。CI はキャッシュを持ち越さずコールド実行なので、この経路のフレークは基本的にローカル限定。 |
| 10 | ブラウザから `http://localhost:6006` が開けない | コンテナ内で `pnpm storybook` を起動しているか、`docker-compose.yml` の `ports` に `127.0.0.1:6006:6006` があるかを確認する。compose の設定を変えた場合は `docker compose up -d` で再作成が必要。**ループバック限定で公開しているため、LAN 上の別マシンからは意図的にアクセスできない**(§2.3)。 |
| 11 | Story を書いたのに Story チェックが失敗する | チェックは対象コンポーネントと**同じディレクトリ**の `<Component>.stories.tsx` **しか見ない**。ファイル名が実装と1文字でも違う場合や、Story を別ディレクトリにまとめた場合は「無い」と判定される。エラー出力の「必要です」のパスと実ファイルパスを見比べる(§4.3.6)。 |
| 12 | Container 系の Story が空白になる | state 注入デコレータ(`withAppState` / `withAppProvider`)を付けているか確認する。Context を提供せずに Container を描画すると Provider 外参照で例外になる。付与していれば初回描画から state が入るので `findBy*` は不要(§4.3.4)。 |
| 13 | E2E で「直したはずのバグが再現する」 | `out/` が古い。`test:e2e:only` ではなく `test:e2e`(`next build &&` 付き)を使う(§4.4.3)。 |
| 14 | Vitest が Playwright のスペックを拾って壊れる | `vitest.config.ts` の `unit` project に `exclude: [...configDefaults.exclude, "e2e/**"]` を追加する(§4.2)。 |
| 15 | コンテナ内でだけブラウザが起動しない(CI は通る) | Dockerfile の `playwright@<VER> install-deps` と `package.json` の `@playwright/test` のバージョンがずれている。CI は `--with-deps` で毎回入れ直すため気付きにくい(§5.6)。 |
| 16 | `pnpm install` がライフサイクルスクリプトの警告で止まる | `pnpm-workspace.yaml` の `onlyBuiltDependencies: []` による既定ブロック。**全部許可せず**、警告に出たパッケージ名だけを配列に追加する(§2.5)。 |
| 17 | a11y 違反が警告のまま CI を通ってしまう | `preview.tsx` の `parameters.a11y.test` が既定の `"todo"` のまま。`"error"` にする。個別の例外は preview 全体ではなく**その Story の `parameters.a11y`** でルールを限定して無効化する(§4.3.7)。 |

---

## 8. 運用ルール(リマインド)

- ホストには Docker 以外入れない。すべてコンテナ内。**ブラウザバイナリも含む。**
- 新規ブランチに upstream は(指示なき限り)設定しない。
- 意味のある単位で定期的にコミットする。
- **PR は必ず Draft PR で作成。**
- コメント・コミットメッセージ・ドキュメントは日本語。
- **コードコメントにチャット由来の表現(「案 A を選択」「議論の結果」など)や自リポジトリの issue / PR 番号を書かない。** 設計判断の経緯(検討した選択肢・選ばなかった理由)はコミットメッセージに残し、`git blame` → コミットで辿れるようにする。外部リポジトリの issue や仕様書など git 履歴から復元できない参照は、理由の文章とセットであれば書いてよい。
- 設計は分割統治・SOLID。PBT が効くロジックは `fast-check` を採用(§4.5)。
- **外部からの入力を受ける処理**(公開 API・ハンドラ・パーサ・設定読込など)は、不正な入力値(`null` / `undefined` / `NaN` / 空文字 / 型違い / 範囲外の数値 / 未知の enum 値)への振る舞いを設計に含め、その振る舞いを検証するテストを用意する。
- **Story を書いたことは単体テストのアサーションを省略してよい理由にはならない**(§1.3 / §4.1)。
- **テストのフレークをリトライ回数で黙らせない。** 原因を特定してから対処する(§4.4.5)。

---

## 付録A. Claude Code をコンテナ内で使う場合の追加設定

> **この付録の設定は本文の構成に対する「上乗せ」である。** Claude Code をコンテナ内で動かさないなら、
> 本文(§2.2 / §2.3 / §2.4)の素の構成のままでよい。

Claude Code は Bash 実行を **bubblewrap によるサンドボックス**で隔離する。この隔離には unprivileged user namespace の作成と、いくつかの OS パッケージ・書き込み可能なパスが必要になる。

### A.1 リスクの明示(先に読むこと)

**`security_opt: seccomp=unconfined` は seccomp フィルタを完全に無効化する。攻撃面を広げるため、この構成は開発専用である。**

- seccomp はコンテナから見えるシステムコールを制限する **多層防御の一層**であり、主たる隔離境界はコンテナそのものである。したがって無効化しても隔離が消えるわけではないが、**一層を意図的に緩めている**ことは自覚しておく。
- **本番運用する場合は override ファイルでこの設定を打ち消すこと。** `docker-compose.override.yml` や `docker-compose.prod.yml` で `security_opt` を空に戻す。
- 外部からの接続を受けるホストや、信頼できない入力を処理するコンテナでこの設定を有効にしない。

なぜ必要かというと、bubblewrap が unprivileged user namespace を作れないと Claude Code の Bash 実行が**全滅する**ためである(`bwrap` が namespace を作れず即座に失敗する)。

### A.2 `docker/Dockerfile` への追加

本文 §2.2 の Dockerfile に対する差分。

```dockerfile
# corepack のキャッシュ/ダウンロード先を allowWrite 対象配下に固定する。
# 既定の ~/.cache/node/corepack は sandbox の allowWrite に含まれず、
# corepack の書込が EROFS で失敗して pnpm が全滅するため。
# ~/.local/share/pnpm/** は .claude/settings.json の allowWrite 対象なので書込可能。
ENV COREPACK_HOME=/home/${APP_USER}/.local/share/pnpm/corepack
```

```dockerfile
# 基本パッケージ(本文の一覧に sudo / bubblewrap / socat を追加する)
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
```

```dockerfile
# APP_USER に sudo 権限を付与(権限調整用、NOPASSWD)
RUN echo "${APP_USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
```

```dockerfile
# USER ${APP_USER} に切り替えたあと、WORKDIR の前に置く。
# Claude Code をグローバルインストール(APP_USER 権限)
RUN npm config set prefix "/home/${APP_USER}/.npm-global"
ENV PATH=/home/${APP_USER}/.npm-global/bin:$PATH
RUN npm install -g @anthropic-ai/claude-code
```

`corepack install` の意味づけもサンドボックス下では変わる。本文のコメントに次を足す。

```dockerfile
# sandbox 下では registry 到達不可で corepack が pnpm を DL できず `pnpm install` が
# 起動前に失敗する。ビルドは sandbox 外=registry 到達可なので、ここで焼いておけば
# 実行時(sandbox 下)は DL 不要。
# COREPACK_HOME(~/.local/share/pnpm/corepack)は named volume 対象外(store のみ volume)
# なので、焼いたキャッシュは実行時もイメージ層として残る。
COPY --chown=${APP_USER}:${APP_USER} package.json ./
RUN corepack install
```

> **`sudo` を入れると `pnpm exec playwright install --with-deps chromium` もコンテナ内で通るようになる。** ただし本文の構成(§2.2)では `install-deps` をイメージビルド時に済ませてあるので、`--with-deps` を付ける必要は依然としてない。

### A.3 `docker-compose.yml` への追加

本文 §2.3 の compose に対する差分。

```yaml
    volumes:
      # (本文の volumes に追加する)
      # Claude の設定・認証・履歴はホストと共有
      # $HOME が未定義だとマウント先が不定になるため、明示的にエラーにする
      - ${HOME:?HOME環境変数が未定義です。ホストの$HOMEが設定されている必要があります}/.claude:/home/node/.claude
    environment:
      # NODE_ENV はコマンド側(next dev / next build)が自動で設定するため
      # ここで強制すると `pnpm build` 時に dev 値が残って prerender が壊れるので設定しない
      CLAUDE_CONFIG_DIR: /home/node/.claude
    security_opt:
      # Claude Code のサンドボックス (bubblewrap) が unprivileged user namespace の
      # 作成を必要とするため、seccomp フィルタを無効化する。
      # 外すと Claude Code の Bash 実行が全滅する(bwrap が namespace を作れない)。
      # NOTE: seccomp 完全無効化は攻撃面を広げるため、この compose は開発専用。
      #       本番運用する場合は override ファイルでこの設定を打ち消すこと
      #       (主隔離境界はコンテナであり、本設定は多層防御の一層を緩めるもの)。
      - seccomp=unconfined
```

`${HOME:?...}` の形にしてあるのは、`$HOME` が未定義のときに**空パスへ黙ってマウントされるのを防ぐ**ため。エラーメッセージ付きで compose を失敗させる。

### A.4 `.devcontainer/devcontainer.json` への追加

本文 §2.4 の `settings` に 1 行追加する。

```jsonc
      "settings": {
        // (本文の settings に追加する)
        "claudeCode.allowDangerouslySkipPermissions": true
      }
```

コンテナ内で隔離されていることを前提に、権限確認のプロンプトを省略する設定である。**ホスト直下や本番環境では有効にしない。**

### A.5 テスト層との相互作用

| 項目 | 内容 |
|---|---|
| **`COREPACK_HOME` の移動** | サンドボックス下で `pnpm` が動くための前提。これが無いと `pnpm test` / `pnpm test:storybook` / `pnpm test:e2e` のすべてが起動前に失敗する |
| **ブラウザバイナリの取得** | `pnpm exec playwright install chromium` はネットワークアクセスを伴う。サンドボックス下で registry / CDN に到達できない場合、**サンドボックス外(通常のターミナル)で先に実行しておく** |
| **`~/.cache/ms-playwright` の書き込み** | サンドボックスの `allowWrite` にこのパスが含まれていないと、サンドボックス下からの `playwright install` が失敗する。`.claude/settings.json` の設定を確認する |
| **`.claude` のマウント** | ホストと共有するため、`.gitignore` は `.claude/*` を除外しつつ `!.claude/settings.json` だけコミット対象にする運用が扱いやすい |

---

*このガイドは diary-task の環境構成(2026年9月時点)を基に作成。バージョンは §5 の手順で都度最新化すること。*
