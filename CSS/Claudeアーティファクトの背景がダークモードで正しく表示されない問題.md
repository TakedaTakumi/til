# Claudeアーティファクトの背景がダークモードで正しく表示されない問題

ClaudeでHTML形式のアーティファクトを作成したとき、ダークモードを使用していると正しくコンテンツが表示されないときがある。
ライトモード前提で作成されていて、背景がシステムのダークモードを採用してしまった時に発生する模様。

無条件でライトモードになるように背景色を設定すれば解決するので、以下をClaudeに伝えて直してもらうのが良い。

## 原因

プレビュー環境（iframe）では `<html>` の背景が描画されず、アプリ側の色が透けて「背景が変わらない」「背景が意図しない色になる」ように見えることがある。

## 対処法：ビューポート全体を覆う固定背景レイヤーを入れる

描画環境に依存せず背景色を確実に反映させるため、`body::before` による**ビューポート全体を覆う固定背景レイヤー**を必ず入れる：

```css
html{min-height:100%;background:var(--page-bg);transition:background .5s ease}
/* 描画環境に依存せず確実に切り替えるための固定レイヤー */
body::before{content:"";position:fixed;inset:0;z-index:-1;
  background:var(--page-bg);transition:background .5s ease}
body{background:var(--page-bg);min-height:100vh;color:var(--page-ink)}
```

あわせて、`color-mix()` を使う箇所（半透明トグルバー等）は**必ず単色フォールバックを前置**する：

```css
background:var(--panel);                                  /* フォールバック */
background:color-mix(in srgb,var(--page-bg) 88%,transparent);
```

## 補足

- 背景色をCSS変数（`--page-bg` 等）で管理している場合、変数は `body` ではなく **`<html>` 要素**に定義すること。`body` に定義すると背景バグの原因になる。
- このバグは実際に2回発生した。最初は変数を `body` から `html` に移して半分直り、最終的に `body::before` の固定レイヤーで確実に解決した。**最初からこの型を使えば再発しない。**
- 経緯の詳細は [和の色をWebカラーテーマにする.md](color-theme/和の色をWebカラーテーマにする.md) の「4-2. 背景が切り替わらないバグの回避」を参照。
