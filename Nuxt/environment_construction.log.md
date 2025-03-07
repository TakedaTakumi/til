# Nuxtの環境構築ログ

## Dockerfile

- dockerignoreを作成
  - [Fast, disk space efficient package manager | pnpm](https://pnpm.io/ja/)

  <details>
  <summary>.dockerignore</summary>

  ```dockerignore
  node_modules
  .git
  .gitignore
  *.md
  dist
  ```
  </details>

- Dockerfileを作成
  - [node - Official Image | Docker Hub](https://hub.docker.com/_/node)

  <details>
  <summary>Dockerfile</summary>

  ```Dockerfile
  FROM node:22 AS base

  ENV PNPM_HOME="/pnpm"
  ENV PATH="$PNPM_HOME:$PATH"
  RUN corepack enable

  WORKDIR /app

  # まず依存関係ファイルだけをコピー
  COPY package.json pnpm-lock.yaml ./

  FROM base AS develop
  RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

  CMD [ "pnpm", "dev" ]

  FROM base AS prod-deps
  RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

  FROM base AS build
  RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
  RUN pnpm run build

  FROM gcr.io/distroless/nodejs22-debian12
  WORKDIR /app
  COPY --from=prod-deps /app/node_modules /app/node_modules
  COPY --from=build /app/dist /app/dist
  EXPOSE 8000

  CMD ["dist/index.js"]
  ```

  </details>

## 環境変数を追加
- 環境変数を追加

  <details>
  <summary>.env</summary>

  ```.env
  PORT=3000
  ```

  </details>


## compose.yaml

- compose.yamlを作成
  <details>
  <summary>compose.yaml</summary>

  ```yaml
  services:
    frontend:
      container_name: mypage-frontend
      tty: true
      build:
        context: .
        dockerfile: Dockerfile
        network: host
        target: develop
      working_dir: /app
      volumes:
        - .:/app
        - frontend-node-modules:/app/node_modules
        - dot-nuxt:/app/.nuxt
      ports:
        - ${PORT?:PORT is not found}:${PORT}
  volumes:
    frontend-node-modules:
    dot-nuxt:
  ```

  </details>

## Nuxtの構築
- [Nuxt: The Intuitive Vue Framework · Nuxt](https://nuxt.com/)

- Dockerfileの記述をコメントアウトする
  - pnpmの初期化がまだなので。
    <details>
    <summary>Dockerfile</summary>

    ```Dockerfile
    FROM node:22 AS base

    ENV PNPM_HOME="/pnpm"
    ENV PATH="$PNPM_HOME:$PATH"
    RUN corepack enable

    WORKDIR /app

    # COPY package.json pnpm-lock.yaml ./

    FROM base AS develop
    # RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

    # CMD [ "pnpm", "dev" ]

    FROM base AS prod-deps
    RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

    FROM base AS build
    RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
    RUN pnpm run build

    FROM gcr.io/distroless/nodejs22-debian12
    WORKDIR /app
    COPY --from=prod-deps /app/node_modules /app/node_modules
    COPY --from=build /app/dist /app/dist
    EXPOSE 8000

    CMD ["dist/index.js"]

    ```
    </details>
- コンテナを起動する
  ```bash
  docker-compose run --rm frontend bash
  ```
  - 以降はコンテナ内での操作
- リポジトリルートでコマンド実行
  - nuxtの生成
    ```bash
    pnpm create nuxt .
    ```
  - 質問に回答しつつ、先に進める
- .gitignoreに`.pnpm-store`を追加
  <details>
  <summary>.gitignore</summary>

  ```gitignore
  # Nuxt dev/build outputs
  .output
  .data
  .nuxt
  .nitro
  .cache
  dist

  # Node dependencies
  node_modules

  # Logs
  logs
  *.log

  # Misc
  .DS_Store
  .fleet
  .idea

  # Local env files
  .env
  .env.*
  !.env.example

  .pnpm-store
  ```
  </details>
- .pnpm-storeフォルダをボリューム化する
  <details>
  <summary>compose.yaml</summary>

  ```yaml
  services:
    frontend:
      container_name: mypage-frontend
      tty: true
      build:
        context: .
        dockerfile: Dockerfile
        network: host
        target: develop
      working_dir: /app
      volumes:
        - .:/app
        - frontend-node-modules:/app/node_modules
        - dot-nuxt:/app/.nuxt
        - dot-pnpm-store:/app/.pnpm-store # 追加
      ports:
        - ${PORT?:PORT is not found}:${PORT}
  volumes:
    frontend-node-modules:
    dot-nuxt:
    dot-pnpm-store: # 追加
  ```
  </details>

- コンテナの外に出る
- Dockerfileのコメントアウトを解除する
- composeが起動できるか確認する
  ```bash
  docker compose up -d
  ```
- `http://localhost:4000/`にアクセスしてNuxtページが開けば成功

- 本番ビルドも確認しておく
  - compose.yamlのdevelopターゲット指定をコメントアウトする
    <details>
    <summary>compose.yaml</summary>

    ```yaml
    services:
      frontend:
        container_name: mypage-frontend
        tty: true
        build:
          context: .
          dockerfile: Dockerfile
          network: host
          # target: develop # コメントアウト
        working_dir: /app
        volumes:
          - .:/app
          - frontend-node-modules:/app/node_modules
          - dot-nuxt:/app/.nuxt
        ports:
          - ${PORT?:PORT is not found}:${PORT}
    volumes:
      frontend-node-modules:
      dot-nuxt:
    ```

    </details>
