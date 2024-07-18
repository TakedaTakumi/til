# Alpineへのgcloud CLIのインストール

## 参考
- 基本的にはこちらの手順そのままで良い。
- https://cloud.google.com/sdk/docs/install-sdk?hl=ja

## インストール

> [!NOTE]
> rootユーザーで実行している場合、`sudo`は使えないので、参考サイト中のコマンドから`sudo`を削除して実行する。
> ここでは、すべて`sudo`抜きでコマンドを記載する。

### 1. パッケージの更新する

```sh
apt-get update
```

### 2. 必要なツールのインストールする
apt-transport-https と curl をインストールする

```sh
apt-get install apt-transport-https ca-certificates gnupg curl
```

### 3. Google Cloud の公開鍵をインポートする

`/usr/share/keyrings`に、`cloud.google.gpg` が保存される。

```sh
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
```

### 4. gcloud CLI の配布 URI をパッケージ ソースとして追加する

```sh
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
```

### 5. gcloud CLI を更新してインストールする

```sh
apt-get update && apt-get install google-cloud-cli
```

> [!NOTE]
> 参考サイトの追加コンポーネントのインストールは省略する

### 6. gcloud init を実行して開始する

以下のコマンドで認証などを行う。

VSCodeのターミナルで実行した場合、うまいことブラウザと連携してくれる。

```sh
gcloud init
```
