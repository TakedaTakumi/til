# ブックマークレット：広告絶対〇すマン

最後の配列にidやclassを指定すると、ブックマークレット実行時に該当タグを削除する。

```javascript
javascript: ((classNameList) => {
  const removeElement = (element) => {
    element.parentNode.removeChild(element);
  };
  classNameList.forEach((className) => {
    document.querySelectorAll(`[class^=${className}]`).forEach(removeElement);
    document.querySelectorAll(`[id^=${className}]`).forEach(removeElement);
  });
})([
  "adsbygoogle",
  "sleeping-ads",
  "google-afc-image",
  "footFixAdBar",
  "ats_inArticle_adBox",
  "m-ad",
  "ats-insert_ads",
  "ats-overlay-bottom-wrapper-rendered",
  "ats-trvd-wrapper",
  "google_ads_iframe",
  "primis_",
]);
```
