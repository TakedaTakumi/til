# 開発コンテナ起動時に拡張機能をインストールするためのスクリプト with bun

このスクリプトを実行すると、`devcontainer.json`に記載されている拡張機能をインストールする。


```ts
// install_extensions.ts
import { readFileSync } from 'fs';
import { $ } from 'bun';

const config_str = readFileSync('.devcontainer.json', 'utf8');
const config_str_without_comment = config_str
  .split('\n')
  .filter((line) => !line.match(/^\s*\/\/ /))
  .join('\n');

const config = JSON.parse(config_str_without_comment);

const extension_list = config.customizations.vscode.extensions;

for (const ext of extension_list) {
  await $`code --install-extension ${ext}`;
}
```

```sh
bun install_extensions.ts
```

bunではなく、Node.jsを利用するときは、以下のようにする。

```ts
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const config_str = readFileSync('.devcontainer.json', 'utf8');
const config_str_without_comment = config_str
  .split('\n')
  .filter((line) => !line.match(/^\s*\/\/ /))
  .join('\n');

const config = JSON.parse(config_str_without_comment);

const extension_list = config.customizations.vscode.extensions;

for (const ext of extension_list) {
  const result = execSync(`code --install-extension ${ext}`);
  console.log(result.toString());
}
```
