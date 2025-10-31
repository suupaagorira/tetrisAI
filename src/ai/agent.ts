import { MatrixBoard } from '../core/board';
import { TetrisGame } from '../core/game';
import { PIECE_SHAPES, getAbsoluteCells } from '../core/pieces';
import {
  ClearResult,
  GameStatus,
  Piece,
  PieceType,
  Rotation,
} from '../core/types';
import { computeFeatures, FeatureVector } from './features';
import { LinearEvaluator } from './evaluator';

export interface PlacementCandidate {
  readonly type: PieceType;
  readonly rotation: Rotation;
  readonly x: number;
  readonly y: number;
  readonly dropDistance: number;
  readonly useHold: boolean;
  readonly origin: 'active' | 'hold' | 'queue';
}

export interface SimulationOutcome {
  candidate: PlacementCandidate;
  clear: ClearResult;
  game: TetrisGame;
  features: FeatureVector;
  evaluation: number;
}

export interface AgentOptions {
  explorationRate?: number;
  enableHold?: boolean;
}

export class PatternInferenceAgent {
  private readonly evaluator: LinearEvaluator;
  private readonly options: AgentOptions;

  constructor(evaluator: LinearEvaluator, options: AgentOptions = {}) {
    this.evaluator = evaluator;
    this.options = options;
  }

  evaluateCandidates(game: TetrisGame): SimulationOutcome[] {
    const status = game.getStatus();
    const candidates = enumerateCandidates(game, status, this.options);
    if (candidates.length === 0) {
      return [];
    }
    const outcomes: SimulationOutcome[] = [];
    for (const candidate of candidates) {
      const outcome = simulateCandidate(game, candidate, this.evaluator);
      if (outcome) {
        outcomes.push(outcome);
      }
    }
    outcomes.sort((a, b) => b.evaluation - a.evaluation);
    return outcomes;
  }

  decide(game: TetrisGame): SimulationOutcome | null {
    const outcomes = this.evaluateCandidates(game);
    if (outcomes.length === 0) {
      return null;
    }
    const explorationRate = this.options.explorationRate ?? 0;
    let selected: SimulationOutcome | null = outcomes[0] ?? null;
    if (explorationRate > 0 && Math.random() < explorationRate) {
      const index = Math.floor(Math.random() * outcomes.length);
      const candidate = outcomes[index];
      selected = candidate ?? selected;
    }
    return selected;
  }

  act(game: TetrisGame): SimulationOutcome | null {
    const decision = this.decide(game);
    if (!decision) {
      return null;
    }
    game.copyFrom(decision.game);
    return decision;
  }
}

function enumerateCandidates(
  game: TetrisGame,
  status: GameStatus,
  options: AgentOptions,
): PlacementCandidate[] {
  const board = game.getBoard();
  const candidates: PlacementCandidate[] = [];
  const active = status.activePiece;
  if (!active) {
    return candidates;
  }

  const pieces: Array<{
    type: PieceType;
    useHold: boolean;
    origin: 'active' | 'hold' | 'queue';
  }> = [{ type: active.type, useHold: false, origin: 'active' }];

  if (options.enableHold !== false && !status.holdLocked) {
    if (status.holdPiece) {
      pieces.push({
        type: status.holdPiece,
        useHold: true,
        origin: 'hold',
      });
    } else if (status.nextQueue.length > 0) {
      const nextPiece = status.nextQueue[0];
      if (nextPiece) {
        pieces.push({
          type: nextPiece,
          useHold: true,
          origin: 'queue',
        });
      }
    }
  }

  for (const pieceInfo of pieces) {
    for (let rotationIndex = 0; rotationIndex < 4; rotationIndex += 1) {
      const rotation = rotationIndex as Rotation;
      const placements = enumeratePlacementsForRotation(
        board,
        pieceInfo.type,
        rotation,
      );
      for (const placement of placements) {
        candidates.push({
          type: pieceInfo.type,
          rotation,
          x: placement.x,
          y: placement.y,
          dropDistance: placement.dropDistance,
          useHold: pieceInfo.useHold,
          origin: pieceInfo.origin,
        });
      }
    }
  }
  return candidates;
}

function enumeratePlacementsForRotation(
  board: MatrixBoard,
  type: PieceType,
  rotation: Rotation,
): Array<{ x: number; y: number; dropDistance: number }> {
  const shape = PIECE_SHAPES[type][rotation];
  const minDx = Math.min(...shape.map(([dx]) => dx));
  const maxDx = Math.max(...shape.map(([dx]) => dx));
  const results: Array<{ x: number; y: number; dropDistance: number }> = [];
  const startY = 0;
  const minX = -minDx;
  const maxX = board.width - 1 - maxDx;

  for (let x = minX; x <= maxX; x += 1) {
    let y = startY;
    if (!canPlaceOnBoard(board, type, rotation, x, y)) {
      continue;
    }
    while (canPlaceOnBoard(board, type, rotation, x, y + 1)) {
      y += 1;
    }
    results.push({ x, y, dropDistance: y - startY });
  }
  return results;
}

function canPlaceOnBoard(
  board: MatrixBoard,
  type: PieceType,
  rotation: Rotation,
  x: number,
  y: number,
): boolean {
  const cells = getAbsoluteCells(type, rotation, { x, y });
  for (const cell of cells) {
    if (cell.y < 0) {
      continue;
    }
    if (!board.isInside(cell.x, cell.y)) {
      return false;
    }
    if (board.isOccupied(cell.x, cell.y)) {
      return false;
    }
  }
  return true;
}

function simulateCandidate(
  game: TetrisGame,
  candidate: PlacementCandidate,
  evaluator: LinearEvaluator,
): SimulationOutcome | null {
  const clone = game.clone();
  if (candidate.useHold && !clone.hold()) {
    return null;
  }
  const piece: Piece = {
    type: candidate.type,
    rotation: candidate.rotation,
    position: { x: candidate.x, y: candidate.y },
  };
  if (!clone.canPlace(piece)) {
    return null;
  }
  const internal = clone as unknown as any;
  const tspinInfo = detectTSpinPotential(game.getBoard(), piece);
  internal.active = piece;
  internal.lastAction = tspinInfo.isTSpin ? 'rotate' : 'hardDrop';
  internal.lastKick = [0, 0];

  let clear: ClearResult | null;
  if (tspinInfo.isTSpin) {
    // Soft drop simulation
    if (
      candidate.dropDistance > 0 &&
      internal.statsValue &&
      typeof internal.statsValue.score === 'number'
    ) {
      internal.statsValue.score += candidate.dropDistance; // Soft drop score
    }
    clear = internal.lockActive();
  } else {
    // Hard drop simulation (original logic)
    if (
      candidate.dropDistance > 0 &&
      internal.statsValue &&
      typeof internal.statsValue.score === 'number'
    ) {
      internal.statsValue.score += candidate.dropDistance * 2; // Hard drop score
    }
    clear = internal.lockActive();
  }
  if (!clear) {
    return null;
  }
  const features = computeFeatures(
    clone.getBoard(),
    clone.getStats(),
    clear,
    candidate.dropDistance,
    clone.isGameOver(),
  );
  const evaluation = evaluator.evaluate(features);
  return {
    candidate,
    clear,
    game: clone,
    features,
    evaluation,
  };
}

function detectTSpinPotential(
  board: MatrixBoard,
  piece: Piece,
): { isTSpin: boolean; isMini: boolean } {
  if (piece.type !== 'T') {
    return { isTSpin: false, isMini: false };
  }
  const tempBoard = board.clone();
  const cells = getAbsoluteCells(piece.type, piece.rotation, piece.position);
  const insideCells = cells.filter((cell) => cell.y >= 0);
  if (insideCells.length === 0) {
    return { isTSpin: false, isMini: false };
  }
  for (const cell of insideCells) {
    if (tempBoard.isInside(cell.x, cell.y)) {
      tempBoard.set(cell.x, cell.y, 8);
    }
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
    if (tempBoard.isOccupied(corner.x, corner.y)) {
      occupied += 1;
    }
  }
  if (occupied < 3) {
    return { isTSpin: false, isMini: false };
  }
  const frontCorners: Record<Rotation, [number, number][]> = {
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
  const front = frontCorners[piece.rotation];
  const frontOccupied = front.reduce(
    (sum, [x, y]) => sum + (tempBoard.isOccupied(x, y) ? 1 : 0),
    0,
  );
  const isMini = frontOccupied < 2;
  return { isTSpin: true, isMini };
}







