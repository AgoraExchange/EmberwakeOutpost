export class Pool<T> {
  private readonly available: T[] = [];
  constructor(private readonly create: () => T, private readonly reset: (item: T) => void, initialSize = 0) {
    for (let index = 0; index < initialSize; index += 1) this.available.push(this.create());
  }
  acquire(): T { return this.available.pop() ?? this.create(); }
  release(item: T): void { this.reset(item); this.available.push(item); }
}
