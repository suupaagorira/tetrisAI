import { describe, expect, it } from 'vitest';

import { BagGenerator } from '../src/core/bag';
import { MatrixBoard, STANDARD_BOARD } from '../src/core/board';
import { computeFeatures } from '../src/ai/features';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../src/ai/evaluator';
import { PatternInferenceAgent } from '../src/ai/agent';
import { TetrisGame } from '../src/core/game';

function createEmptyStats() {
  const game = new TetrisGame({ seed: 99 });
  return game.getStats();
}

describe('BagGenerator', () => {
  it('produces all seven pieces before repeating', () => {
    const bag = new BagGenerator(1234);
    const seen = new Set<string>();
    for (let i = 0; i < 7; i += 1) {
      seen.add(bag.next());
    }
    expect(seen.size).toBe(7);
  });
});

describe('MatrixBoard', () => {
  it('clears full lines correctly', () => {
    const board = new MatrixBoard(STANDARD_BOARD);
    const targetRow = board.height - 1;
    for (let x = 0; x < board.width; x += 1) {
      board.set(x, targetRow, 1);
    }
    const result = board.clearLines();
    expect(result.clearedRows).toEqual([targetRow]);
    for (let x = 0; x < board.width; x += 1) {
      expect(board.get(x, targetRow)).toBe(0);
    }
  });
});

describe('TetrisGame', () => {
  it('enforces hold lock until piece is placed', () => {
    const game = new TetrisGame({ seed: 2024 });
    const firstHold = game.hold();
    expect(firstHold).toBe(true);
    expect(game.hold()).toBe(false);
    game.hardDrop();
    expect(game.hold()).toBe(true);
  });
});

describe('Feature extraction', () => {
  it('returns zeroed features for an empty board', () => {
    const board = new MatrixBoard(STANDARD_BOARD);
    const stats = createEmptyStats();
    const clear = {
      linesCleared: 0,
      clearType: 'none' as const,
      backToBackAwarded: false,
      combo: -1,
      scoreGained: 0,
      garbageSent: 0,
    };
    const features = computeFeatures(board, stats, clear, 0);
    expect(features.values.bias).toBe(1);
    expect(features.values.lines_cleared).toBe(0);
    expect(features.values.aggregate_height).toBe(0);
    expect(features.values.holes).toBe(0);
    expect(features.values.drop_distance).toBe(0);
    Object.values(features.values).forEach((value) => {
      expect(Number.isFinite(value)).toBe(true);
    });
  });
});

describe('PatternInferenceAgent', () => {
  it('produces a valid decision on a fresh game state', () => {
    const evaluator = new LinearEvaluator({ weights: DEFAULT_WEIGHTS });
    const agent = new PatternInferenceAgent(evaluator, { enableHold: true });
    const game = new TetrisGame({ seed: 135 });
    const decision = agent.decide(game);
    expect(decision).not.toBeNull();
  });
});


