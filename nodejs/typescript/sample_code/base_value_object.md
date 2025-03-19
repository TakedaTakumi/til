# TypeScriptサンプルコード - 値オブジェクトの基本型

継承して使う。

バリデーション失敗時に例外を投げるようにしているので、不正な値の場合はインスタンスの生成に失敗する。

```typescript
const opaqueSymbol: unique symbol = Symbol('opaqueSymbol');

export abstract class BaseValueObject<TSymbol extends string, T> {
  readonly [opaqueSymbol]: TSymbol;
  protected _value!: T;

  protected abstract validate(value: T): T;

  constructor(value: T) {
    this._value = this.validate(value);
  }

  get value(): T {
    return this._value;
  }

  equals(other: BaseValueObject<TSymbol, T>): boolean {
    return this === other || this._value === other._value;
  }
}
```
