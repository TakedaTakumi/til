# ブックマークレット：広告絶対〇すマン

最後の配列にidやclassを指定すると、ブックマークレット実行時に該当タグを削除する。

[ブックマーク用リンク](javascript%3A%28function%28classNameList%29%7Bconst%20removeElement%3D%28element%29%3D%3E%7Belement.parentNode.removeChild%28element%29%3B%7D%3BclassNameList.forEach%28%28className%29%3D%3E%7Bdocument.querySelectorAll%28%60%5Bclass%5E%3D%24%7BclassName%7D%5D%60%29.forEach%28removeElement%29%3Bdocument.querySelectorAll%28%60%5Bid%5E%3D%24%7BclassName%7D%5D%60%29.forEach%28removeElement%29%3B%7D%29%3B%7D%29%28%5B%27adsbygoogle%27%2C%27sleeping-ads%27%2C%27google-afc-image%27%2C%27footFixAdBar%27%2C%27ats_inArticle_adBox%27%2C%27m-ad%27%2C%27ats-insert_ads-17-wrapper%27%2C%27ats-overlay-bottom-wrapper-rendered%27%2C%27ats-trvd-wrapper%27%2C%27google_ads_iframe%27%5D%29%3B)

```javascript
javascript: (
	(classNameList) => {
		const removeElement = (element) => {
			element.parentNode.removeChild(element);
		};
		classNameList.forEach((className) => {
			document.querySelectorAll(`[class^=${className}]`).forEach(removeElement);
			document.querySelectorAll(`[id^=${className}]`).forEach(removeElement);
		});
	}
)([
	'adsbygoogle',
	'sleeping-ads',
	'google-afc-image',
	'footFixAdBar',
	'ats_inArticle_adBox',
	'm-ad',
	'ats-insert_ads-17-wrapper',
	'ats-overlay-bottom-wrapper-rendered',
	'ats-trvd-wrapper',
	'google_ads_iframe'
]);
```
