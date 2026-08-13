/**
 * Seeded PRNG using Mulberry32 algorithm.
 * Guarantees 100% deterministic procedural city generation across sessions.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  /**
   * Returns pseudo-random float between 0 (inclusive) and 1 (exclusive).
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns float in range [min, max)
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns integer in range [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Pick random item from array
   */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Chance helper (e.g., chance(0.7) returns true 70% of the time)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Fast, simple string hash for deterministic material assignment
   */
  static hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit int
    }
    return Math.abs(hash);
  }
}
