# Git Command

## ファイル単体をリセットする方法

```sh
git checkout HEAD -- filename.txt
```

## gitでuntrackedなファイルを一括削除する方法

```sh
git clean -fdx
```

## マージする

```sh
git merge <commit|branchname>
```

## コミット時にテキストエディタを起動する

```sh
git commit -v
```

## push

```sh
git push origin
```

ブランチを指定する。
（リモートとローカルでブランチ名が同じとき）
```sh
git push origin <branch-name>
```

リモートブランチとローカルブランチを指定する
```sh
git push origin <remote-branch>:<local-branch>
```

## rebase

現在のブランチをmainにリベースする。
```sh
git rebase main
```

## ブランチ

### 一覧取得

```sh
git branch

git branch -a # リモートも含む一覧を取得する
```

### 作成

作成するのみでブランチの変更はしない方法。
```sh
git branch new_branch_name
```

作成と同時に変更する方法
```sh
git checkout -b new_branch_name
```

## 管理外のファイルの削除

確認
```sh
# ファイル
git clean -xn

# ディレクトリを含む
git clean -xdn
```

削除
```sh
# ファイル
git clean -xf

# ディレクトリを含む
git clean -xdf
```

## Stashの操作

### 退避する
```sh
git stash -u

git stash save "stash message"
```

### 退避した作業の一覧を見る
```sh
git stash list
```

### 退避をもとに戻す
```sh
git stash apply stash@{0}

# 元に戻すと同時にリストから消す
git stash pop stash@{0}
```

### 退避したものを消す
```sh
git stash drop stash@{0}
```

## Checkoutせずに特定のブランチをpullする

```sh
# リモートoriginからdevelopブランチをpull
git fetch
git fetch . origin/develop:develop
```
※ただし、ファストフォワード可能な場合に限る。
※現在のブランチの場合は動作しない。
