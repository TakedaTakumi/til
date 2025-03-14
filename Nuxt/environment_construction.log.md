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
  COPY --from=build /app/.output /app/.output
  EXPOSE 8000

  CMD ["./.output/server/index.mjs"]
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
        - dot-pnpm-store:/app/.pnpm-store
      ports:
        - ${PORT?:PORT is not found}:${PORT}
  volumes:
    frontend-node-modules:
    dot-nuxt:
    dot-pnpm-store:
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
          - dot-pnpm-store:/app/.pnpm-store
        ports:
          - ${PORT?:PORT is not found}:${PORT}
    volumes:
      frontend-node-modules:
      dot-nuxt:
      dot-pnpm-store:
    ```

    </details>

## .devcontainerを追加

- .devcontainerを追加
  <details>
  <summary>.devcontainer.json</summary>

  ```json
  {
    "name": "Nuxt",
    "build": {
      "dockerfile": "Dockerfile",
      "context": "..",
      "target": "develop"
    },
    "runArgs": [
      "--network=host"
    ],
    "service": "frontend"
  }
  ```

  </details>

### 拡張機能のインストールスクリプト

- `devcontainer`起動時に拡張機能がインストールされないことがあるので、手動でインストールするためのスクリプトを追加する。
- 以下のスクリプトを追加する
  - <details>
      <summary>tools/install_extensions.ts</summary>

      ```typescript
      import { execSync } from 'child_process';
      import { readFileSync } from 'fs';

      const config_str = readFileSync('.devcontainer.json', 'utf8');
      const config_str_without_comment = config_str
        .split('\n')
        .filter((line) => !line.match(/^\s*\/\/ /))
        .join('\n');

      const config = JSON.parse(config_str_without_comment);

      const extension_list = config.customizations.vscode.extensions;

      for (const ext of extension_list) {
        console.log(execSync(`code --install-extension ${ext}`).toString());
      }
      ```
    </details>
  - package.jsonにスクリプトを追加する。
    - <details>
        <summary>package.json</summary>

        ```json
        {
          "scripts": {
            "preinstall": "npx only-allow pnpm",
            "install:ext": "node tools/install_extensions.mjs",
            "i:ext": "pnpm run install:ext",
          },
        }
        ```
      </details>

## linterの追加

- [`@nuxt/eslint`](https://eslint.nuxt.com/packages/module)を有効にする。
    
    ```shell
    npx nuxi module add eslint
    ```
    
    - `eslint.config.mjs`が生成される。
- typescriptもインストールする
    
    ```bash
    pnpm add -D typescript
    ```
- package.jsonにnpmスクリプトを追加する。
    - <details>
      <summary>package.json</summary>

        ```json
        {
          "scripts": {
            ...
            "lint": "eslint .",
            "lint:fix": "eslint . --fix",
            ...
          },
        }
        ```
    </details>
- ESLint Stylisticを有効にする。
  - <details>
    <summary>nuxt.config.ts</summary>

    ```tsx
    export default defineNuxtConfig({
      modules: [
        '@nuxt/eslint'
      ],
      eslint: {
        stylistic: true  // 追加
      }
    })
    ```

    </details>
- Dev Server Checkerを有効にする。
  - <details>
    <summary>nuxt.config.ts</summary>
      ```tsx
      export default defineNuxtConfig({
        modules: [
          '@nuxt/eslint'
        ],
        eslint: {
          checker: process.env.NODE_ENV === 'local'  // 追加
        }
      })
      ```
    </details>
- ルールを追加する
  - <details>
    <summary>eslint.config.mjs</summary>

    ```typescript
    import withNuxt from './.nuxt/eslint.config.mjs';

    export default withNuxt(
      {
        files: ['**/*.{ts,vue,mjs}'],
        rules: {
          '@stylistic/semi': ['error', 'always'],
          '@stylistic/member-delimiter-style': [
            'error',
            {
              multiline: {
                delimiter: 'semi',
                requireLast: true,
              },
              singleline: {
                delimiter: 'comma',
                requireLast: false,
              },
            },
          ],
          '@stylistic/operator-linebreak': ['error', 'before',
            {
              overrides: {
                '=': 'after',
                '??': 'none',
              },
            },
          ],
          '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
          '@stylistic/quote-props': ['error', 'as-needed'],
          '@stylistic/arrow-parens': ['error', 'always'],
        },
        ignores: ['.idea', '.vscode', '.nuxt', 'public', '.output'],
      },
      {
        files: ['**/*.vue'],
        rules: {
          'vue/no-multiple-template-root': 'off',
          'vue/multi-word-component-names': 'off',
        },
        ignores: ['.idea', '.vscode', '.nuxt', 'public', '.output'],
      },
    );

    ```
    </details>

### linterプラグインを追加する
- インストールする
  ```shell
  pnpm add -D eslint-plugin-import
  ```
- ルールを追加する
  <details>
    <summary>eslint.config.mjs</summary>

    ```typescript
    // @ts-check
    import withNuxt from './.nuxt/eslint.config.mjs'

    export default withNuxt([{
        files: ['**/*.{ts,vue,mjs}'],
        rules: {
          'no-console': 'warn',
          '@typescript-eslint/interface-name-prefix': 'off',
          '@typescript-eslint/explicit-function-return-type': 'off',
          '@typescript-eslint/explicit-module-boundary-types': 'off',
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unused-vars': [
            'error',
            {
              args: 'all',
              argsIgnorePattern: '^_',
              caughtErrors: 'all',
              caughtErrorsIgnorePattern: '^_',
              destructuredArrayIgnorePattern: '^_',
              varsIgnorePattern: '^_',
              ignoreRestSiblings: true,
            },
          ],
          'import/no-useless-path-segments': ['error'],
          'import/no-cycle': [2, { maxDepth: 1 }],

          'import/order': [
            'error',
            {
              groups: [
                'builtin',
                'external',
                'internal',
                'parent',
                'sibling',
                'index',
                'object',
                'type',
              ],

              alphabetize: {
                order: 'asc',
                caseInsensitive: true,
              },

              'newlines-between': 'always',
            },
          ],

          'no-restricted-globals': [
            'error',
            {
              name: 'isNaN',
              message: 'Use Number.isNaN',
            },
          ],
        }
    },
    {
        files: ['**/*.vue'],
        rules: {
          'vue/no-multiple-template-root': 'off',
          'vue/multi-word-component-names': 'off',
        },
        ignores: ['.idea', '.vscode', '.nuxt', 'public', '.output'],
    }])
    ```
  </details>

## srcディレクトリを有効にする

- nuxt.config.tsに設定を追加する
    - <details>
      <summary>nuxt.config.ts</summary>
        ```tsx
        // https://nuxt.com/docs/api/configuration/nuxt-config
        export default defineNuxtConfig({
          compatibilityDate: '2024-04-03',
          devtools: { enabled: true },
          srcDir: 'src/',  // 追加
        })
        ```
      </details>
- src/以下で動作するディレクトリを移動する。
    - [こちら](https://nuxt.com/docs/api/nuxt-config#srcdir)より抜粋
    ```bash
    -| app/
    ---| node_modules/
    ---| nuxt.config.js
    ---| package.json
    ---| src/
    ------| assets/
    ------| components/
    ------| layouts/
    ------| middleware/
    ------| pages/
    ------| plugins/
    ------| public/
    ------| store/
    ------| server/
    ------| app.config.ts
    ------| app.vue
    ------| error.vue
    ```

## Pagesを有効にする

- pageファイルを作成する
    - <details>
      <summary>src/pages/index.vue</summary>
      - 拡張機能にスニペットがあるので、空ファイルに`vue3` と入力し、TABキーを押すと、`script`, `tamplate`, `style`のタグが自動で入力される。
        ```tsx
        <script setup lang='ts'>
        </script>
        <template>
          <NuxtRouteAnnouncer />
          <NuxtWelcome />
        </template>
        
        <style scoped>
        </style>
        ```

      </details>        
        
- app.vueを修正する。
    - <details>
      <summary>src/app.vue</summary>

        ```tsx
        <template>
          <div>
            <NuxtPage /> <!-- 修正 -->
          </div>
        </template>
        ```
      
      </details>

## レイアウトを有効にする

- app.vueを修正する。
  - <details>
    <summary>app.vue</summary>

      ```tsx
      <template>
        <div>
          <NuxtLayout>
            <NuxtPage />
          </NuxtLayout>
        </div>
      </template>
      ```


    </details>
- レイアウトファイルを追加する。
  - <details>
    <summary>src/layout/default.vue</summary>

      ```tsx
      <script setup lang='ts'>
      </script>
      
      <template>
        <div>
          <slot />
        </div>
      </template>
      
      <style scoped>
      </style>
      ```
    
    </details>

        

## サーバーサイドレンダリングを有効にする

- nuxt.config.tsに設定を追加する。
  - <details>
    <summary>nuxt.config.ts</summary>

      ```tsx
      export default defineNuxtConfig({
        ssr: true // 追加
      })
      ```

    </details>

## 型チェックを有効にする
- [TypeScript · Nuxt Concepts](https://nuxt.com/docs/guide/concepts/typescript#type-checking)
- 必要な依存をインストールする
    ```bash
    pnpm add -D vue-tsc typescript
    ```
- 設定を有効にする。
    ```bash
    npx nuxi typecheck
    ```
- 開発時に型チェックを実行するように設定する。
  - <details>
    <summary>nuxt.config.ts</summary>

      ```tsx
      export default defineNuxtConfig({
        // 追加
        typescript: {
          typeCheck: true // ビルド時に型チェックを実行する場合は"build"にする
        }
      })
      ```

    </details>

## tailwindcssを有効にする
- [Install Tailwind CSS with Nuxt - Tailwind CSS](https://tailwindcss.com/docs/installation/framework-guides/nuxt)
- tailwindcssをインストールする
    ```bash
    pnpm add tailwindcss @tailwindcss/vite
    ```
- nuxt.config.tsを修正する
  - <details>
    <summary>nuxt.config.ts</summary>

    ```tsx
    import tailwindcss from "@tailwindcss/vite"; // 追加

    export default defineNuxtConfig({
      compatibilityDate: "2024-11-01",
      devtools: { enabled: true },
      vite: {
        plugins: [
          tailwindcss(), // 追加
        ],
      },
    });
    ```
    
    </details>
- tailwindcssをimportする
  - <details>
    <summary>src/assets/css/main.css</summary>
    
    ```css
    @import "tailwindcss";
    ```

    </details>
- グローバルにcssファイルを追加する
  - <details>
    <summary>nuxt.config.ts</summary>
    
    ```tsx
    import tailwindcss from "@tailwindcss/vite";

    export default defineNuxtConfig({
      compatibilityDate: "2024-11-01",
      devtools: { enabled: true },
      css: ['~/assets/css/main.css'], // 追加
      vite: {
        plugins: [
          tailwindcss(),
        ],
      },
    });
    ```

    </details>
