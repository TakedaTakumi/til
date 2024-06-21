# TypeScriptサンプルコード - 値オブジェクトの基本型

継承して使う。

Result型は[こちら](./result.md)を参照。

```typescript
export abstract class BaseValueObject<T> {
  protected _value!: T;

  protected abstract validate(value: T): Result<T, Error>;

  constructor(value: T) {
    this.validate(value).match({
      success: (value) => {
        this._value = value;
      },
      failure: (error) => {
        throw error;
      },
    });
  }

  get value(): T {
    return this._value;
  }

  equals(name: BaseValueObject<T>): boolean {
    return this._value === name.value;
  }
}
```
