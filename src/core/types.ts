export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type Rotation = 0 | 1 | 2 | 3;

export interface Point {
  x: number;
  y: number;
}

export interface Piece {
  type: PieceType;
  rotation: Rotation;
  position: Point;
}

export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface BoardDimensions {
  width: number;
  height: number;
  hiddenRows: number;
}

export interface GameStats {
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  totalPieces: number;
}

export type ClearType =
  | 'none'
  | 'single'
  | 'double'
  | 'triple'
  | 'tetris'
  | 'tspin-mini'
  | 'tspin'
  | 'tspin-single'
  | 'tspin-double'
  | 'tspin-triple';

export interface ClearResult {
  linesCleared: number;
  clearType: ClearType;
  backToBackAwarded: boolean;
  combo: number;
  scoreGained: number;
}

export interface GameStatus {
  board: Board;
  activePiece: Piece | null;
  holdPiece: PieceType | null;
  holdLocked: boolean;
  nextQueue: PieceType[];
  stats: GameStats;
  finished: boolean;
}

// Forward declaration to avoid circular shaping in TypeScript.
export interface Board {
  readonly width: number;
  readonly height: number;
  readonly hiddenRows: number;
  readonly cells: Cell[][];
  clone(): Board;
  get(x: number, y: number): Cell | undefined;
  set(x: number, y: number, value: Cell): void;
  isInside(x: number, y: number): boolean;
  isOccupied(x: number, y: number): boolean;
  lockPiece(coordinates: readonly Point[], cellValue: Cell): void;
  clearLines(): { clearedRows: number[] };
}
