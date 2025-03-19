# Cloud SQL（PostgreSQL）の操作方法

1. Databaseの一覧を表示する
   - ```shell
     \l
     ```
2. Databaseを選択する
   - 選択するときにアクセスするユーザーを変更する。
   - ```shell
     \c <database name> <user name>
     ```
   - 変更するユーザーのパスワードを求められるので、入力する
3. ここまでくれば、一般的なSQL文で操作ができる。
4. テーブル一覧を表示する
   - ```shell
     \dt
     ```
5. テーブルの構造を表示する
   - ```shell
     \d <tabel name>
     ```


