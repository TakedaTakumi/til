# データをファイルとしてダウンロードする

- 各種ファイルを用意することなく、データをファイルとしてダウンロードする方法

## 参考サイト

- [VueのデータをCSV形式でダウンロードする #JavaScript - Qiita](https://qiita.com/bellx2/items/4640f0fd78c369d3311f)
- [クライアント側でjsonファイルの書き出し/読み込みを行う #JavaScript - Qiita](https://qiita.com/noa_28/items/9aa57270378cc2374122)


## CSV

- vuetifyを使用

```vue
<template>
  <v-btn @click="downloadCSV">CSVをダウンロードする</v-btn>
</template>

<script setup lang="ts">

const csvBody = ref<string>(''); // CSVの内容を格納する変数

function downloadCSV() {
  const blob = new Blob([csvBody.value], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calendar.csv';
  a.click();
  window.URL.revokeObjectURL(url);
}
</script>
```

## JSON

- vuetifyを使用

```vue
<template>
  <v-btn @click="downloadJSON">JSONをダウンロードする</v-btn>
</template>

<script setup lang="ts">

const jsonBody = ref<string>(''); // JSONの内容を格納する変数

function downloadJSON() {
  const blob = new Blob([jsonBody.value], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'calendar.json';
  a.click();
  window.URL.revokeObjectURL(url);
}
</script>
```
