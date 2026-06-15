/**
 * Минимальная двоичная куча (min-heap) для A*.
 *
 * Операции push/pop за O(log n). Используется как open set —
 * быстрее наивного поиска минимума за O(n) на больших графах.
 */
export class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Добавить элемент с приоритетом (меньше — раньше). */
  push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  /** Извлечь элемент с минимальным приоритетом. */
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top.item;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i].priority >= this.heap[parent].priority) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.heap[left].priority < this.heap[smallest].priority)
        smallest = left;
      if (right < n && this.heap[right].priority < this.heap[smallest].priority)
        smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}
