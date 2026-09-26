/**
 * Minimal generic object pool. Anything that spawns repeatedly (units,
 * projectiles, damage numbers, effects) should be acquired from a pool and
 * released back instead of being created and destroyed per spawn.
 *
 * For Phaser game objects, use `onAcquire` / `onRelease` to toggle
 * `setActive` / `setVisible` (and reset per-use state).
 */
export interface ObjectPoolOptions<T> {
  /** Builds a brand-new item when the free list is empty. */
  create: () => T;
  /** Runs every time an item leaves the pool (including brand-new ones). */
  onAcquire?: (item: T) => void;
  /** Runs every time an item goes back into the pool. */
  onRelease?: (item: T) => void;
  /** Runs on `destroy()` for every item, active or free. */
  onDestroy?: (item: T) => void;
  /** Number of items to create up front. */
  prewarm?: number;
}

export class ObjectPool<T extends object> {
  private readonly free: T[] = [];
  private readonly active = new Set<T>();

  constructor(private readonly options: ObjectPoolOptions<T>) {
    const prewarm = options.prewarm ?? 0;
    for (let i = 0; i < prewarm; i++) {
      const item = options.create();
      options.onRelease?.(item);
      this.free.push(item);
    }
  }

  acquire(): T {
    const item = this.free.pop() ?? this.options.create();
    this.active.add(item);
    this.options.onAcquire?.(item);
    return item;
  }

  /** Returns false (and does nothing) if the item isn't currently active. */
  release(item: T): boolean {
    if (!this.active.delete(item)) return false;
    this.options.onRelease?.(item);
    this.free.push(item);
    return true;
  }

  releaseAll(): void {
    for (const item of Array.from(this.active)) this.release(item);
  }

  /**
   * Visits active items without allocating. Releasing the current item from
   * inside the callback is safe; acquiring during iteration may or may not
   * visit the new item.
   */
  forEachActive(fn: (item: T) => void): void {
    for (const item of this.active) fn(item);
  }

  /** Live view of the items currently checked out. Do not mutate. */
  get activeItems(): ReadonlySet<T> {
    return this.active;
  }

  get activeCount(): number {
    return this.active.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Destroys every item and empties the pool. */
  destroy(): void {
    for (const item of this.active) this.options.onDestroy?.(item);
    for (const item of this.free) this.options.onDestroy?.(item);
    this.active.clear();
    this.free.length = 0;
  }
}
