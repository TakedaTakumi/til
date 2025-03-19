# オニオンアーキテクチャのレイヤーごとのインポート違反を検知する

```json
{
  "import/no-restricted-paths": [
    "error",
    {
      "zones": [
        // Domain層のimport制限
        {
          "from": "./src/application/**/*",
          "target": "./src/domain/**/!(*.spec.ts|*.test.ts)",
          "message": "Domain層でApplication層をimportしてはいけません。",
        },
        {
          "from": "./src/presentation/**/*",
          "target": "./src/domain/**/!(*.spec.ts|*.test.ts)",
          "message": "Domain層でPresentation層をimportしてはいけません。",
        },
        {
          "from": "./src/infrastructure/**/*",
          "target": "./src/domain/**/!(*.spec.ts|*.test.ts)",
          "message": "Domain層でInfrastructure層をimportしてはいけません。",
        },
        // Application層のimport制限
        {
          "from": "./src/presentation/**/*",
          "target": "./src/application/**/!(*.spec.ts|*.test.ts)",
          "message": "Application層でPresentation層をimportしてはいけません。",
        },
        {
          "from": "./src/infrastructure/**/*",
          "target": "./src/application/**/!(*.spec.ts|*.test.ts)",
          "message": "Application層でInfrastructure層をimportしてはいけません。",
        },
        // Presentation層のimport制限
        {
          "from": "./src/domain/**/*",
          "target": "./src/presentation/**/!(*.spec.ts|*.test.ts)",
          "message": "Presentation層でDomain層をimportしてはいけません。",
        },
        {
          "from": "./src/infrastructure/**/*",
          "target": "./src/presentation/**/!(*.spec.ts|*.test.ts)",
          "message": "Presentation層でInfrastructure層をimportしてはいけません。",
        },
        // Infrastructure層のimport制限
        {
          "from": "./src/application/**/*",
          "target": "./src/infrastructure/**/!(*.spec.ts|*.test.ts)",
          "message": "Infrastructure層でApplication層をimportしてはいけません。",
        },
        {
          "from": "./src/presentation/**/*",
          "target": "./src/infrastructure/**/!(*.spec.ts|*.test.ts)",
          "message": "Infrastructure層でPresentation層をimportしてはいけません。",
        },
      ],
    },
  ],
}
```
