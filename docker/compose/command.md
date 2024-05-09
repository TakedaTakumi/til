# docker compose command

## 実行・停止

```sh
docker compose up

# バックグラウンド実行
docker compose up -d

docker compose down
```

## 個別実行・停止

```sh
docker compose up [サービス名]

docker compose rm -fsv [サービス名]
```

### 例

```sh
docker compose up server

docker compose rm -fsv server
```

### コンテナ再起動

```sh
docker compose restart [サービス名]
```
## 滅びの呪文

compose down のときにimageやvolumeも含めて削除する。
```sh
docker compose down --rmi all --volumes --remove-orphans
```

## 環境変数が無いときにエラーを出す


