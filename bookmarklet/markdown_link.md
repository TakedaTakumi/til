# Markdown用のリンクをクリップボードにコピーする

## 参考

- [ブックマークレットで Markdown 用のリンクテキストを自動生成 #JavaScript - Qiita](https://qiita.com/YokohamaHori/items/cc49607d6b005b414ff3)

## コード

```javascript
javascript:(()=>{const pageTitle=document.title;const url=location.href;if(pageTitle&&url){const text='['+pageTitle+']('+url+')';const ta=document.createElement('textarea');ta.textContent=text;document.body.appendChild(ta);ta.select();if(!document.execCommand('copy')){prompt('コピー失敗',text)()} ta.parentNode.removeChild(ta)}else{alert('テキスト取得失敗')}})()
```
