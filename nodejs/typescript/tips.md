# TypeScript Tips


## ランダムな配列を生成する。

```typescript
// 10個の文字列配列を生成する。
const array = Array.from({ length: 10 }).map(() => 'dummy string')
```

## Sleep

```typescript
// 3秒待つ
await new Promise(resolve => setTimeout(resolve, 3000));
```

## Promise内でawaitする

```typescript
return new Promise(resolve => {
	(async () => {
	// 3秒待つ
	await new Promise(resolve => setTimeout(resolve, 3000));

	resolve();
	})();
});
```
