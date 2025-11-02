import { MatrixBoard, STANDARD_BOARD } from '../core/board';
import { ClearResult, GameStats } from '../core/types';

export interface FeatureVector {
  readonly values: Record<string, number>;
}

export interface ColumnMetrics {
  heights: number[];
  holes: number;
  wellDepth: number;
  columnTransitions: number;
}

export function computeFeatures(
  board: MatrixBoard,
  stats: GameStats,
  clear: ClearResult,
  dropDistance: number,
  isGameOver: boolean,
): FeatureVector {
  const visibleRows = collectVisibleRows(board);
  const metrics = analyzeColumns(visibleRows);
  const rowTransitions = countRowTransitions(visibleRows);
  const occupied = countOccupiedCells(visibleRows);
  const surfaceRoughness = computeSurfaceRoughness(metrics.heights);
  const gaps = countGaps(visibleRows);
  const tspinOpportunities = detectTSpinOpportunities(visibleRows, metrics.heights);
  const holeAnalysis = analyzeHoleReachability(visibleRows, metrics.heights);

  const values: Record<string, number> = {
    bias: 1,
    lines_cleared: clear.linesCleared / 4,
    tetris: clear.clearType === 'tetris' ? 1 : 0,
    tspin: clear.clearType.startsWith('tspin') && !clear.clearType.includes('mini') ? 1 : 0,
    tspin_mini: clear.clearType.includes('mini') ? 1 : 0,
    back_to_back: stats.backToBack ? 1 : 0,
    combo: Math.max(0, stats.combo) / 10,
    combo_active: stats.combo > 0 ? 1 : 0,
    aggregate_height:
      metrics.heights.reduce((sum, h) => sum + h, 0) /
      (board.width * visibleRows.length || 1),
    max_height: (metrics.heights.length > 0 ? Math.max(...metrics.heights) : 0) / (visibleRows.length || 1),
    holes: metrics.holes / (board.width * visibleRows.length || 1),
    bumpiness: computeBumpiness(metrics.heights) /
      (board.width * visibleRows.length || 1),
    wells: metrics.wellDepth / (board.width * visibleRows.length || 1),
    row_transitions: rowTransitions / (board.width * visibleRows.length || 1),
    column_transitions:
      metrics.columnTransitions / (board.width * visibleRows.length || 1),
    occupancy: occupied / (board.width * visibleRows.length || 1),
    surface_roughness: surfaceRoughness / (board.width || 1),
    drop_distance: dropDistance / (visibleRows.length || 1),
    score_gain: clear.scoreGained / 1000,
    perfect_clear: board.cells.every((row) => row.every((cell) => cell === 0))
      ? 1
      : 0,
    wasted_placement: clear.linesCleared === 0 ? 1 : 0,
    game_over: isGameOver ? 1 : 0,
    gaps: gaps / (board.width * visibleRows.length || 1),
    // New extended features
    tspin_opportunity: tspinOpportunities / 5, // Normalize: typically 0-5 opportunities
    reachable_holes: holeAnalysis.reachable / (board.width * visibleRows.length || 1),
    buried_holes: holeAnalysis.buried / (board.width * visibleRows.length || 1),
  };

  return { values };
}

export function collectVisibleRows(board: MatrixBoard): number[][] {
  const rows: number[][] = [];
  for (let y = STANDARD_BOARD.hiddenRows; y < board.height; y += 1) {
    rows.push([...board.cells[y]!]);
  }
  return rows;
}

function countGaps(rows: number[][]): number {
  let gaps = 0;
  for (const row of rows) {
    if (!row) {
      continue;
    }
    for (let x = 1; x < row.length - 1; x++) {
      if (row[x] === 0 && row[x - 1] !== 0 && row[x + 1] !== 0) {
        gaps++;
      }
    }
  }
  return gaps;
}
export function analyzeColumns(rows: number[][]): ColumnMetrics {
  const width = rows[0]?.length ?? 0;
  const heights = new Array<number>(width).fill(0);
  const columnTransitionsPerColumn = new Array<number>(width).fill(0);
  let totalHoles = 0;
  let wellDepth = 0;

  for (let x = 0; x < width; x += 1) {
    let columnHeight = 0;
    let seenBlock = false;
    let columnHoles = 0;
    for (let y = 0; y < rows.length; y += 1) {
      const filled = rows[y]?.[x] ?? 0;
      if (filled !== 0) {
        if (!seenBlock) {
          columnHeight = rows.length - y;
          seenBlock = true;
        }
      } else if (seenBlock) {
        columnHoles += 1;
      }
    }
    heights[x] = columnHeight;
    totalHoles += columnHoles;
    columnTransitionsPerColumn[x] = countColumnTransitions(rows, x);
  }

  for (let x = 0; x < width; x += 1) {
    const current = heights[x] ?? 0;
    const left =
      x === 0
        ? Number.MAX_SAFE_INTEGER
        : heights[x - 1] ?? Number.MAX_SAFE_INTEGER;
    const right =
      x === width - 1
        ? Number.MAX_SAFE_INTEGER
        : heights[x + 1] ?? Number.MAX_SAFE_INTEGER;
    if (current < left && current < right) {
      wellDepth += Math.min(left, right) - current;
    }
  }

  return {
    heights,
    holes: totalHoles,
    wellDepth,
    columnTransitions: columnTransitionsPerColumn.reduce(
      (sum, value) => sum + value,
      0,
    ),
  };
}

function countRowTransitions(rows: number[][]): number {
  let transitions = 0;
  for (const row of rows) {
    if (!row) {
      continue;
    }
    let previousFilled = true;
    for (const cell of row) {
      const filled = cell !== 0;
      if (filled !== previousFilled) {
        transitions += 1;
      }
      previousFilled = filled;
    }
    if (!previousFilled) {
      transitions += 1;
    }
  }
  return transitions;
}

function countColumnTransitions(rows: number[][], x: number): number {
  let transitions = 0;
  let previousFilled = true;
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    if (!row) {
      previousFilled = false;
      continue;
    }
    if (x >= row.length) {
      previousFilled = false;
      continue;
    }
    const cellValue = row[x]!;
    const filled = cellValue !== 0;
    if (filled !== previousFilled) {
      transitions += 1;
    }
    previousFilled = filled;
  }
  if (!previousFilled) {
    transitions += 1;
  }
  return transitions;
}

function computeBumpiness(heights: number[]): number {
  let sum = 0;
  for (let i = 0; i < heights.length - 1; i += 1) {
    const current = heights[i] ?? 0;
    const next = heights[i + 1] ?? 0;
    sum += Math.abs(current - next);
  }
  return sum;
}

function countOccupiedCells(rows: number[][]): number {
  let occupied = 0;
  for (const row of rows) {
    if (!row) {
      continue;
    }
    for (const cell of row) {
      if (cell !== 0) {
        occupied += 1;
      }
    }
  }
  return occupied;
}

function computeSurfaceRoughness(heights: number[]): number {
  if (heights.length === 0) {
    return 0;
  }
  const average =
    heights.reduce((sum, h) => sum + h, 0) / heights.length;
  return heights.reduce(
    (sum, h) => sum + Math.abs(h - average),
    0,
  );
}

/**
 * Detect T-Spin setup opportunities
 * Looks for patterns where a T-piece could fit with rotation
 */
export function detectTSpinOpportunities(rows: number[][], heights: number[]): number {
  let opportunities = 0;
  const width = rows[0]?.length ?? 0;

  // Scan for T-Spin setups: look for overhang patterns
  // A typical T-Spin setup has a hole with blocks above on 3 sides
  for (let x = 1; x < width - 1; x += 1) {
    const leftHeight = heights[x - 1] ?? 0;
    const centerHeight = heights[x] ?? 0;
    const rightHeight = heights[x + 1] ?? 0;

    // T-Spin Single setup: Center is lower, sides are higher
    if (centerHeight < leftHeight && centerHeight < rightHeight) {
      const heightDiff = Math.min(leftHeight - centerHeight, rightHeight - centerHeight);

      // Check if there's a 1-3 block deep hole
      if (heightDiff >= 1 && heightDiff <= 3) {
        // Verify there's space for T-piece and overhang exists
        const centerY = rows.length - centerHeight;
        if (centerY >= 0 && centerY < rows.length) {
          const leftCell = rows[centerY]?.[x - 1] ?? 0;
          const rightCell = rows[centerY]?.[x + 1] ?? 0;

          // Both sides should have blocks (overhang)
          if (leftCell !== 0 && rightCell !== 0) {
            opportunities += 1;
          }
        }
      }
    }

    // T-Spin Double setup: Look for 2-wide holes with overhangs
    if (x < width - 2) {
      const center2Height = heights[x + 1] ?? 0;
      const right2Height = heights[x + 2] ?? 0;

      // Pattern: High-Low-Low-High (classic T-Spin Double setup)
      if (
        leftHeight > centerHeight &&
        leftHeight > center2Height &&
        right2Height > centerHeight &&
        right2Height > center2Height
      ) {
        const maxLowHeight = Math.max(centerHeight, center2Height);
        const minHighHeight = Math.min(leftHeight, right2Height);
        const depth = minHighHeight - maxLowHeight;

        if (depth >= 2 && depth <= 4) {
          opportunities += 1;
        }
      }
    }
  }

  return opportunities;
}

/**
 * Analyze hole reachability: separate holes into reachable vs buried
 */
interface HoleAnalysis {
  reachable: number;
  buried: number;
}

function analyzeHoleReachability(rows: number[][], heights: number[]): HoleAnalysis {
  const width = rows[0]?.length ?? 0;
  let reachableHoles = 0;
  let buriedHoles = 0;

  for (let x = 0; x < width; x += 1) {
    const columnHeight = heights[x] ?? 0;
    let seenBlock = false;
    let holesInColumn = 0;
    const holeDepths: number[] = [];

    // Scan from top to bottom
    for (let y = 0; y < rows.length; y += 1) {
      const cell = rows[y]?.[x] ?? 0;

      if (cell !== 0) {
        seenBlock = true;
      } else if (seenBlock) {
        // This is a hole
        holesInColumn += 1;
        const depthFromTop = y - (rows.length - columnHeight);
        holeDepths.push(depthFromTop);
      }
    }

    // Classify holes by reachability
    for (const depth of holeDepths) {
      // Reachable: within 3 blocks of surface
      if (depth <= 3) {
        reachableHoles += 1;
      } else {
        buriedHoles += 1;
      }
    }
  }

  return { reachable: reachableHoles, buried: buriedHoles };
}















