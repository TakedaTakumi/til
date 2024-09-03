# TypeScriptサンプルコード - Result型

```typescript
export class Result<T, E extends Error> {
  static success<T>(value: T): Result<T, Error> {
    return new Result<T, Error>(value);
  }

  static failure<E extends Error>(error: E): Result<any, E> {
    return new Result<any, E>(error);
  }

  private readonly value: T | E;

  private constructor(value: T | E) {
    this.value = value;
  }

  get isFailure(): boolean {
    return this.value instanceof Error;
  }
  get isSuccess(): boolean {
    return this.isFailure === false;
  }

  unwrap(): T | E {
    return this.value;
  }
  unwrap_as_success(): T {
    if (this.value instanceof Error) {
      assert('unwrap_as_success called on failure result');
    }

    return this.value as T;
  }
  unwrap_as_failure(): E {
    if (!(this.value instanceof Error)) {
      assert('unwrap_as_failure called on success result');
    }

    return this.value as E;
  }
  unwrap_or_throw(): T {
    if (this.isFailure) {
      throw this.unwrap_as_failure();
    }

    return this.unwrap_as_success();
  }

  match<R>(branch: { success: (data: T) => R; failure: (error: E) => R }): R {
    if (this.value instanceof Error) {
      return branch.failure(this.value);
    } else {
      return branch.success(this.value);
    }
  }

  async matchAsync<R>(branch: {
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


