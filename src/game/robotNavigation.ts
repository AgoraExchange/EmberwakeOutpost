import type { Rect, Vec2 } from './types';

/** Conservative grid routing around trees, industry, lakes, walls and expedition ridges. */
export function robotRoute(start: Vec2, goal: Vec2, blockers: readonly Rect[], width: number, height: number): Vec2[] {
  const cell = 40, radius = 13;
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell), count = cols * rows;
  const blocked = new Uint8Array(count);
  for (const rect of blockers) {
    const x0 = Math.max(0, Math.floor((rect.x - radius) / cell));
    const x1 = Math.min(cols - 1, Math.floor((rect.x + rect.width + radius) / cell));
    const y0 = Math.max(0, Math.floor((rect.y - radius) / cell));
    const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.height + radius) / cell));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * cols + x] = 1;
  }
  const id = (p: Vec2) => Math.max(0, Math.min(rows - 1, Math.floor(p.y / cell))) * cols
    + Math.max(0, Math.min(cols - 1, Math.floor(p.x / cell)));
  const point = (n: number) => ({ x: (n % cols + .5) * cell, y: (Math.floor(n / cols) + .5) * cell });
  const source = id(start);
  let target = id(goal);
  if (blocked[target]) {
    let best = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = target % cols + dx, y = Math.floor(target / cols) + dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const candidate = y * cols + x, p = point(candidate);
      const d = Math.hypot(p.x - goal.x, p.y - goal.y);
      if (!blocked[candidate] && d < best) { best = d; }
    }
    if (!Number.isFinite(best)) return [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = id(goal) % cols + dx, y = Math.floor(id(goal) / cols) + dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const candidate = y * cols + x, p = point(candidate);
      if (!blocked[candidate] && Math.hypot(p.x - goal.x, p.y - goal.y) === best) target = candidate;
    }
  }
  blocked[source] = 0;
  const costs = new Float64Array(count).fill(Infinity), prev = new Int32Array(count).fill(-1), closed = new Uint8Array(count);
  const heap: Array<{ n: number; score: number }> = [];
  const heuristic = (n: number) => Math.hypot(n % cols - target % cols, Math.floor(n / cols) - Math.floor(target / cols));
  const push = (n: number, score: number) => {
    let i = heap.length; heap.push({ n, score });
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent]!.score <= score) break; heap[i] = heap[parent]!; i = parent; }
    heap[i] = { n, score };
  };
  const pop = () => {
    const result = heap[0]!.n, last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child++;
        if (last.score <= heap[child]!.score) break;
        heap[i] = heap[child]!; i = child;
      }
      heap[i] = last;
    }
    return result;
  };
  costs[source] = 0; push(source, heuristic(source));
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    if (current === target) {
      const path: Vec2[] = [];
      for (let n = target; n !== source && n >= 0; n = prev[n]!) path.push(point(n));
      path.reverse();
      if (!blocked[id(goal)]) path.push({ ...goal });
      return path.length ? path : [point(target)];
    }
    closed[current] = 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = current % cols + dx, y = Math.floor(current / cols) + dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const next = y * cols + x;
      if (blocked[next] || closed[next] || (dx && dy && (blocked[current + dx] || blocked[current + dy * cols]))) continue;
      const cost = costs[current]! + Math.hypot(dx, dy);
      if (cost >= costs[next]!) continue;
      costs[next] = cost; prev[next] = current; push(next, cost + heuristic(next));
    }
  }
  return [];
}
