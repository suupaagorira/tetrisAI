import { MatrixBoard, STANDARD_BOARD } from './board';
import { BagGenerator } from './bag';
import {
  Cell,
  ClearResult,
  ClearType,
  GameStats,
  GameStatus,
  Piece,
  PieceType,
  Rotation,
} from './types';
import { getAbsoluteCells, rotate, SRS_KICKS } from './pieces';

type LastAction = 'spawn' | 'move' | 'softDrop' | 'hardDrop' | 'rotate';
type RotationDir = 'cw' | 'ccw' | '180';

const SPAWN_X = 3;
const SPAWN_Y = 0;

const PIECE_VALUE: Record<PieceType, number> = {
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
};

const SCORE_TABLE: Record<ClearType, number> = {
  none: 0,
  single: 100,
  double: 300,
  triple: 500,
  tetris: 800,
  'tspin-mini': 100,
  tspin: 400,
  'tspin-single': 800,
  'tspin-double': 1200,
  'tspin-triple': 1600,
};

const B2B_ELIGIBLE: ClearType[] = [
  'tetris',
  'tspin',
  'tspin-mini',
  'tspin-single',
  'tspin-double',
  'tspin-triple',
];

const GARBAGE_TABLE: Record<ClearType, number> = {
  none: 0,
  single: 0,
  double: 1,
  triple: 2,
  tetris: 4,
  'tspin-mini': 0,
  tspin: 0,
  'tspin-single': 2,
  'tspin-double': 4,
  'tspin-triple': 6,
};

interface InternalState {
  board: MatrixBoard;
  bag: BagGenerator;
  queue: PieceType[];
  active: Piece | null;
  hold: PieceType | null;
  holdUsed: boolean;
  stats: GameStats;
  finished: boolean;
  lastAction: LastAction;
  lastKick: [number, number];
}

interface GameOptions {
  seed?: number;
  initialState?: InternalState;
}

export class TetrisGame {
  private board: MatrixBoard;
  private bag: BagGenerator;
  private queue: PieceType[];
  private active: Piece | null;
  private holdPiece: PieceType | null;
  private holdLocked: boolean;
  private statsValue: GameStats;
  private finished: boolean;
  private lastAction: LastAction;
  private lastKick: [number, number];

  constructor(options: GameOptions = {}) {
    if (options.initialState) {
      const state = options.initialState;
      this.board = state.board;
      this.bag = state.bag;
      this.queue = [...state.queue];
      this.active = state.active ? { ...state.active } : null;
      this.holdPiece = state.hold;
      this.holdLocked = state.holdUsed;
      this.statsValue = { ...state.stats };
      this.finished = state.finished;
      this.lastAction = state.lastAction;
      this.lastKick = [...state.lastKick] as [number, number];
      return;
    }
    this.board = new MatrixBoard(STANDARD_BOARD);
    this.bag = new BagGenerator(options.seed);
    this.queue = [];
    this.active = null;
    this.holdPiece = null;
    this.holdLocked = false;
    this.statsValue = {
      score: 0,
      lines: 0,
      level: 1,
      combo: -1,
      backToBack: false,
      totalPieces: 0,
    };
    this.finished = false;
    this.lastAction = 'spawn';
    this.lastKick = [0, 0];
    this.refillQueue();
    this.spawnNext();
  }

  clone(): TetrisGame {
    return new TetrisGame({
      initialState: {
        board: this.board.clone() as MatrixBoard,
        bag: this.bag.clone(),
        queue: [...this.queue],
        active: this.active ? { ...this.active } : null,
        hold: this.holdPiece,
        holdUsed: this.holdLocked,
        stats: { ...this.statsValue },
        finished: this.finished,
        lastAction: this.lastAction,
        lastKick: [...this.lastKick] as [number, number],
      },
    });
  }

  copyFrom(other: TetrisGame): void {
    const source = other as unknown as {
      board: MatrixBoard;
      bag: BagGenerator;
      queue: PieceType[];
      active: Piece | null;
      holdPiece: PieceType | null;
      holdLocked: boolean;
      statsValue: GameStats;
      finished: boolean;
      lastAction: LastAction;
      lastKick: [number, number];
    };
    this.board = source.board.clone() as MatrixBoard;
    this.bag = source.bag.clone();
    this.queue = [...source.queue];
    this.active = source.active ? { ...source.active } : null;
    this.holdPiece = source.holdPiece;
    this.holdLocked = source.holdLocked;
    this.statsValue = { ...source.statsValue };
    this.finished = source.finished;
    this.lastAction = source.lastAction;
    this.lastKick = [...source.lastKick];
  }

  getBoard(): MatrixBoard {
    return this.board;
  }

  getActivePiece(): Piece | null {
    return this.active ? { ...this.active } : null;
  }

  getHoldPiece(): PieceType | null {
    return this.holdPiece;
  }

  getNextQueue(): PieceType[] {
    return [...this.queue];
  }

  getStats(): GameStats {
    return { ...this.statsValue };
  }

  isGameOver(): boolean {
    return this.finished;
  }

  getStatus(): GameStatus {
    return {
      board: this.board.clone(),
      activePiece: this.getActivePiece(),
      holdPiece: this.getHoldPiece(),
      holdLocked: this.holdLocked,
      nextQueue: this.getNextQueue(),
      stats: this.getStats(),
      finished: this.finished,
    };
  }

  move(deltaX: number): boolean {
    if (!this.active || this.finished) {
      return false;
    }
    const candidate: Piece = {
      ...this.active,
      position: {
        x: this.active.position.x + deltaX,
        y: this.active.position.y,
      },
    };
    if (this.canPlace(candidate)) {
      this.active = candidate;
      this.lastAction = 'move';
      return true;
    }
    return false;
  }

  softDrop(): ClearResult | null {
    if (!this.active || this.finished) {
      return null;
    }
    const candidate: Piece = {
      ...this.active,
      position: {
        x: this.active.position.x,
        y: this.active.position.y + 1,
      },
    };
    if (this.canPlace(candidate)) {
      this.active = candidate;
      this.lastAction = 'softDrop';
      this.statsValue.score += 1;
      return null;
    }
    return this.lockActive();
  }

  hardDrop(): ClearResult | null {
    if (!this.active || this.finished) {
      return null;
    }
    let distance = 0;
    while (true) {
      const candidate: Piece = {
        ...this.active,
        position: {
          x: this.active.position.x,
          y: this.active.position.y + 1,
        },
      };
      if (!this.canPlace(candidate)) {
        break;
      }
      this.active = candidate;
      distance += 1;
    }
    this.statsValue.score += distance * 2;
    this.lastAction = 'hardDrop';
    return this.lockActive();
  }

  rotate(direction: RotationDir): boolean {
    if (!this.active || this.finished) {
      return false;
    }
    const targetRotation: Rotation =
      direction === 'cw'
        ? rotate(this.active.rotation, 1)
        : direction === 'ccw'
        ? rotate(this.active.rotation, -1)
        : rotate(this.active.rotation, 2);
    const pieceKicks = SRS_KICKS[this.active.type];
    const rotationKicks = pieceKicks[this.active.rotation]?.[targetRotation];
    const kicks = rotationKicks ?? [[0, 0]];
    for (const [dx, dy] of kicks) {
      const candidate: Piece = {
        ...this.active,
        rotation: targetRotation,
        position: {
          x: this.active.position.x + dx,
          y: this.active.position.y + dy,
        },
      };
      if (this.canPlace(candidate)) {
        this.active = candidate;
        this.lastAction = 'rotate';
        this.lastKick = [dx, dy];
        return true;
      }
    }
    return false;
  }

  hold(): boolean {
    if (!this.active || this.finished || this.holdLocked) {
      return false;
    }
    const currentType = this.active.type;
    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this.spawnNext();
    } else {
      const swapType = this.holdPiece;
      this.holdPiece = currentType;
      this.spawnPiece(swapType);
    }
    this.holdLocked = true;
    return true;
  }

  ghostY(): number | null {
    if (!this.active || this.finished) {
      return null;
    }
    let y = this.active.position.y;
    while (true) {
      const candidate: Piece = {
        ...this.active,
        position: { x: this.active.position.x, y: y + 1 },
      };
      if (!this.canPlace(candidate)) {
        return y;
      }
      y += 1;
    }
  }

  injectGarbage(lines: number, random: () => number = Math.random): void {
    if (this.finished || lines <= 0) {
      return;
    }
    const width = this.board.width;
    const garbageValue = 8 as Cell;
    for (let i = 0; i < lines; i += 1) {
      if (this.board.cells.length === 0) {
        break;
      }
      this.board.cells.shift();
      const holeColumn = Math.max(
        0,
        Math.min(width - 1, Math.floor(random() * width)),
      );
      const newRow = new Array<Cell>(width).fill(garbageValue);
      newRow[holeColumn] = 0;
      this.board.cells.push(newRow);
    }
    if (this.active && !this.canPlace(this.active)) {
      this.finished = true;
      this.active = null;
    }
  }

  canPlace(piece: Piece): boolean {
    const cells = getAbsoluteCells(piece.type, piece.rotation, piece.position);
    return cells.every(({ x, y }) => {
      if (y < 0) {
        return true;
      }
      if (!this.board.isInside(x, y)) {
        return false;
      }
      return !this.board.isOccupied(x, y);
    });
  }

  private lockActive(): ClearResult | null {
    if (!this.active) {
      return null;
    }
    const cells = getAbsoluteCells(
      this.active.type,
      this.active.rotation,
      this.active.position,
    );
    const cellValue = PIECE_VALUE[this.active.type] as Cell;
    this.board.lockPiece(cells, cellValue);
    const { clearedRows } = this.board.clearLines();
    const linesCleared = clearedRows.length;
    const clearType = this.evaluateClearType(this.active, linesCleared);
    const baseScore = this.calculateScore(clearType, linesCleared);
    let totalScore = baseScore;

    if (linesCleared > 0) {
      this.statsValue.lines += linesCleared;
      this.statsValue.level = 1 + Math.floor(this.statsValue.lines / 10);
      this.statsValue.combo =
        this.statsValue.combo < 0 ? 1 : this.statsValue.combo + 1;
    } else {
      this.statsValue.combo = -1;
    }

    const qualifiesB2B = B2B_ELIGIBLE.includes(clearType);
    let backToBackAwarded = false;
    if (qualifiesB2B) {
      if (this.statsValue.backToBack) {
        totalScore = Math.floor(baseScore * 1.5);
        backToBackAwarded = true;
      }
      this.statsValue.backToBack = true;
    } else if (linesCleared > 0) {
      this.statsValue.backToBack = false;
    }

    if (linesCleared > 0 && this.statsValue.combo > 1) {
      totalScore += (this.statsValue.combo - 1) * 50;
    }

    this.statsValue.score += totalScore;
    this.statsValue.totalPieces += 1;

    const comboCount = this.statsValue.combo;
    const garbageSent = this.calculateGarbageSent(
      clearType,
      linesCleared,
      backToBackAwarded,
      comboCount,
    );

    const result: ClearResult = {
      linesCleared,
      clearType,
      backToBackAwarded,
      combo: comboCount,
      scoreGained: totalScore,
      garbageSent,
    };

    this.active = null;
    this.spawnNext();
    return result;
  }

  private evaluateClearType(piece: Piece, clearedLines: number): ClearType {
    if (piece.type !== 'T') {
      switch (clearedLines) {
        case 0:
          return 'none';
        case 1:
          return 'single';
        case 2:
          return 'double';
        case 3:
          return 'triple';
        case 4:
          return 'tetris';
        default:
          return 'none';
      }
    }
    const { isTSpin, isMini } = this.detectTSpin(piece);
    if (!isTSpin) {
      if (clearedLines === 4) {
        return 'tetris';
      }
      const mapping: ClearType[] = [
        'none',
        'single',
        'double',
        'triple',
        'tetris',
      ];
      return mapping[clearedLines] ?? 'none';
    }
    if (clearedLines === 0) {
      return isMini ? 'tspin-mini' : 'tspin';
    }
    if (clearedLines === 1) {
      return isMini ? 'tspin-mini' : 'tspin-single';
    }
    if (clearedLines === 2) {
      return 'tspin-double';
    }
    if (clearedLines === 3) {
      return 'tspin-triple';
    }
    return 'tspin';
  }

  private detectTSpin(piece: Piece): { isTSpin: boolean; isMini: boolean } {
    if (piece.type !== 'T' || this.lastAction !== 'rotate') {
      return { isTSpin: false, isMini: false };
    }
    const center = {
      x: piece.position.x + 1,
      y: piece.position.y + 1,
    };
    const corners = [
      { x: center.x - 1, y: center.y - 1 },
      { x: center.x + 1, y: center.y - 1 },
      { x: center.x - 1, y: center.y + 1 },
      { x: center.x + 1, y: center.y + 1 },
    ];
    let occupied = 0;
    for (const corner of corners) {
      if (this.board.isOccupied(corner.x, corner.y)) {
        occupied += 1;
      }
    }
    if (occupied < 3) {
      return { isTSpin: false, isMini: false };
    }
    const frontCornerMap: Record<Rotation, [number, number][]> = {
      0: [
        [center.x - 1, center.y + 1],
        [center.x + 1, center.y + 1],
      ],
      1: [
        [center.x - 1, center.y - 1],
        [center.x - 1, center.y + 1],
      ],
      2: [
        [center.x - 1, center.y - 1],
        [center.x + 1, center.y - 1],
      ],
      3: [
        [center.x + 1, center.y - 1],
        [center.x + 1, center.y + 1],
      ],
    };
    const front = frontCornerMap[piece.rotation];
    const frontOccupied = front.reduce(
      (total, [x, y]) => total + (this.board.isOccupied(x, y) ? 1 : 0),
      0,
    );
    const isMini =
      frontOccupied < 2 ||
      (this.lastKick[0] !== 0 || this.lastKick[1] !== 0);
    return { isTSpin: true, isMini };
  }

  private calculateScore(type: ClearType, clearedLines: number): number {
    if (type === 'none' && clearedLines === 0) {
      return 0;
    }
    const base = SCORE_TABLE[type] ?? 0;
    return base * this.statsValue.level;
  }

  private calculateGarbageSent(
    type: ClearType,
    linesCleared: number,
    backToBackAwarded: boolean,
    combo: number,
  ): number {
    if (linesCleared <= 0) {
      return 0;
    }
    let garbage = GARBAGE_TABLE[type] ?? 0;
    if (backToBackAwarded && garbage > 0) {
      garbage += 1;
    }
    if (combo > 1) {
      garbage += Math.floor((combo - 1) / 2);
    }
    return garbage;
  }

  private spawnNext(): void {
    this.refillQueue();
    const next = this.queue.shift();
    if (!next) {
      this.finished = true;
      this.active = null;
      return;
    }
    this.spawnPiece(next);
  }

  private spawnPiece(type: PieceType): void {
    const piece: Piece = {
      type,
      rotation: 0,
      position: { x: SPAWN_X, y: SPAWN_Y },
    };
    if (!this.canPlace(piece)) {
      this.finished = true;
      this.active = null;
      return;
    }
    this.active = piece;
    this.holdLocked = false;
    this.lastAction = 'spawn';
    this.lastKick = [0, 0];
  }

  private refillQueue(): void {
    while (this.queue.length < 6) {
      this.queue.push(this.bag.next());
    }
  }
}



