# TypeScriptサンプルコード - ファーストクラスコレクションの基本型

継承して使う。

```typescript
export class FirstClassCollection<T> {
  constructor(protected readonly list: T[]) {}

  get length(): number {
    return this.list.length;
  }
  get isEmpty(): boolean {
    return this.list.length === 0;
  }

  at(idx: number): T {
    return this.list[idx];
  }
  get(idx: number): T {
    return this.list[idx];
  }

  toList(): T[] {
    return [...this.list];
  }

  forEach(callback: (item: T, idx?: number, array?: T[]) => void): void {
    this.list.forEach(callback);
  }
  map<U>(callback: (item: T, idx?: number, array?: T[]) => U): U[] {
    return this.list.map(callback);
  }
  filter(callback: (item: T, idx?: number, array?: T[]) => boolean): T[] {
    return this.list.filter(callback);
  }
  find(
    callback: (item: T, idx?: number, array?: T[]) => boolean,
  ): T | undefined {
    return this.list.find(callback);
  }
  some(callback: (item: T, idx?: number, array?: T[]) => boolean): boolean {
    return this.list.some(callback);
  }
  every(callback: (item: T, idx?: number, array?: T[]) => boolean): boolean {
    return this.list.every(callback);
  }
}
```
