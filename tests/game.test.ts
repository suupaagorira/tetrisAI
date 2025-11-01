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

  it('clears multiple consecutive lines correctly (Tetris)', () => {
    const board = new MatrixBoard(STANDARD_BOARD);
    // Fill the bottom 4 rows to simulate a Tetris clear
    const rows = [18, 19, 20, 21];
    for (const row of rows) {
      for (let x = 0; x < board.width; x += 1) {
        board.set(x, row, 1);
      }
    }

    // Add a marker cell above the cleared lines to verify rows shift correctly
    board.set(5, 17, 2);

    const result = board.clearLines();
    expect(result.clearedRows).toEqual(rows);

    // The top 4 rows should now be empty (new rows added at top)
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < board.width; x += 1) {
        expect(board.get(x, y)).toBe(0);
      }
    }

    // The marker cell should have moved down 4 rows (from 17 to 21)
    expect(board.get(5, 21)).toBe(2);
    expect(board.get(5, 17)).toBe(0);
  });

  it('clears multiple non-consecutive lines correctly', () => {
    const board = new MatrixBoard(STANDARD_BOARD);
    // Fill rows 18 and 20 (with gap at 19)
    const rows = [18, 20];
    for (const row of rows) {
      for (let x = 0; x < board.width; x += 1) {
        board.set(x, row, 1);
      }
    }

    // Add a marker in row 19 (should move down 2 after both rows cleared)
    board.set(3, 19, 2);
    // Add a marker above row 18 (should move down 2 after both clears)
    board.set(4, 17, 3);

    const result = board.clearLines();
    expect(result.clearedRows).toEqual(rows);

    // The top 2 rows should now be empty (new rows added at top)
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < board.width; x += 1) {
        expect(board.get(x, y)).toBe(0);
      }
    }

    // The marker from row 19 should now be at row 20
    expect(board.get(3, 20)).toBe(2);
    expect(board.get(3, 19)).toBe(0);

    // The marker from row 17 should now be at row 19 (moved down 2)
    expect(board.get(4, 19)).toBe(3);
    expect(board.get(4, 17)).toBe(0);
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


