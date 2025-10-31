import { PieceType } from './types';

const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function shuffle<T>(input: readonly T[], nextRandom: () => number): T[] {
  const array = input.slice();
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const temp = array[i]!;
    array[i] = array[j]!;
    array[j] = temp;
  }
  return array;
}

export interface BagState {
  state: number;
  buffer: PieceType[];
}

export class BagGenerator {
  private state: number;
  private buffer: PieceType[] = [];

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  private nextRandom(): number {
    this.state += 0x6d2b79f5;
    let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  next(): PieceType {
    if (this.buffer.length === 0) {
      this.buffer = shuffle(ALL_PIECES, () => this.nextRandom());
    }
    return this.buffer.pop()!;
  }

  peek(count: number): PieceType[] {
    while (this.buffer.length < count) {
      this.buffer = [
        ...this.buffer,
        ...shuffle(ALL_PIECES, () => this.nextRandom()),
      ];
    }
    return this.buffer.slice(-count).reverse();
  }

  clone(): BagGenerator {
    const next = new BagGenerator();
    next.setState(this.getState());
    return next;
  }

  getState(): BagState {
    return {
      state: this.state,
      buffer: [...this.buffer],
    };
  }

  setState(state: BagState): void {
    this.state = state.state;
    this.buffer = [...state.buffer];
  }
}
