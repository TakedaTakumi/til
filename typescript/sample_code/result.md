# TypeScriptサンプルコード - Result型

```typescript
export class Result<T, E extends Error> {
  static success<T>(value: T): Result<T, Error> {
    return new Result<T, Error>(value);
  }

  static failure<E extends Error>(error: E): Result<any, E> {
    return new Result<any, E>(error);
  }

  protected readonly value: T | E;

  protected constructor(value: T | E) {
    this.value = value;
  }

  get isSuccess(): boolean {
    return !(this.value instanceof Error);
  }
  get isFailure(): boolean {
    return this.value instanceof Error;
  }

  unwrap(): T | E {
    return this.value;
  }
  unwrap_as_success(): T {
    if (this.value instanceof Error) {
      throw new Error('unwrap_as_success called on failure result');
    }

    return this.value;
  }
  unwrap_as_failure(): E {
    if (!(this.value instanceof Error)) {
      throw new Error('unwrap_as_failure called on success result');
    }

    return this.value;
  }

  which<R>(branch: { success: (data: T) => R; failure: (error: E) => R }): R {
    if (this.value instanceof Error) {
      return branch.failure(this.value);
    } else {
      return branch.success(this.value);
    }
  }

  async whichAsync<R>(branch: {
    success: (data: T) => Promise<R>;
    failure: (error: E) => Promise<R>;
  }): Promise<R> {
    if (this.value instanceof Error) {
      return branch.failure(this.value);
    } else {
      return branch.success(this.value);
    }
  }
}

export type PromiseResult<T, E extends Error> = Promise<Result<T, E>>;
```


