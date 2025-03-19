# Cloud ShellからCloud SQLにアクセスする方法

メモ：[クイックスタート: Cloud Shell から Cloud SQL for PostgreSQL に接続する  |  Google Cloud](https://cloud.google.com/sql/docs/postgres/connect-instance-cloud-shell?hl=ja)

1. プロジェクトをセットする
   ```shell
   gcloud config set project <PROJECT_ID>
   ```
2. 承認ダイアログが出るので「承認する」
3. コマンドからCloud SQLへ接続する
   - postgresユーザーでアクセスする。
     - Cloud SQLの仕様でpostgresユーザーでアクセスしないといけない。
   - ```shell
     gcloud sql connect <INSTANCE_ID> --user=postgres
     ```
4. `postgres`ユーザーのパスワードが求められるので、入力する。
5. Sellの表示が変わったら、アクセス成功。
