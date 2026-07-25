# 背景色に応じて文字色を自動的に変更する

## 参考

- [CSSのfilterを使って、背景色に合わせた文字色を自動的に設定する - Blanktar](https://blanktar.jp/blog/2020/11/css-automate-foreground-text-color)

## コード

- 文字色を背景色と同じ色とし、cssのfilter機能を利用することで実現する。

```html
<div>
    <span>hello world!</span>
</div>

<style>
div {
    background-color: red;
}
span {
    color: red;
    filter: invert(100%) grayscale(100%) contrast(100);
}
</style>

```
