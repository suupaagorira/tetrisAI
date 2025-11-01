/**
 * Extended Feature Extraction (F-system)
 *
 * Adds versus-mode specific features and additional metrics for strategic play.
 * Extends the base feature extraction with:
 * - Piece availability metrics
 * - Send/receive dynamics
 * - Attack potential calculations
 */

import { TetrisGame } from '../core/game';
import { FeatureVector, computeFeatures } from './features';
import { Piece, PieceType } from '../core/types';

/**
 * Extended feature vector with versus-mode features
 */
export interface ExtendedFeatureVector extends FeatureVector {
  readonly values: Record<string, number>;
}

/**
 * Versus-mode context for feature extraction
 */
export interface VersusContext {
  opponentHeight?: number;        // Opponent's max height (normalized 0-1)
  opponentHoles?: number;          // Opponent's hole count (normalized)
  incomingGarbage?: number;        // Pending incoming garbage lines
  outgoingGarbage?: number;        // Garbage being sent
  canCancel?: boolean;             // Can cancel incoming garbage
  opponentBackToBack?: boolean;    // Opponent has B2B active
  opponentCombo?: number;          // Opponent's combo count
}

/**
 * Compute extended features including versus-mode dynamics
 */
export function computeExtendedFeatures(
  game: TetrisGame,
  dropDistance: number,
  isGameOver: boolean,
  versusContext?: VersusContext
): ExtendedFeatureVector {
  // Get base features
  const gameStats = game.getStats();
  const clearResult: import('../core/types').ClearResult = {
    linesCleared: 0,  // This would need to be tracked separately or passed as parameter
    clearType: 'none',
    scoreGained: 0,
    backToBackAwarded: false,
    combo: 0,
    garbageSent: 0
  };

  const stats = {
    score: gameStats.score,
    level: gameStats.level,
    lines: gameStats.lines,
    combo: gameStats.combo,
    backToBack: gameStats.backToBack,
    totalPieces: gameStats.totalPieces
  };

  const board = game.getBoard();
  const baseFeatures = computeFeatures(
    board,
    stats,
    clearResult,
    dropDistance,
    isGameOver
  );

  // Add piece availability features
  const pieceAvailability = analyzePieceAvailability(game);

  // Add versus-mode features if context provided
  const versusFeatures = versusContext
    ? computeVersusFeatures(game, versusContext)
    : {};

  // Add attack potential
  const attackPotential = computeAttackPotential(game);

  const extendedValues = {
    ...baseFeatures.values,
    ...pieceAvailability,
    ...versusFeatures,
    attack_potential: attackPotential
  };

  return { values: extendedValues };
}

/**
 * Analyze piece availability in queue and hold
 */
function analyzePieceAvailability(game: TetrisGame): Record<string, number> {
  const queue = game.getNextQueue().slice(0, 6);  // Look at next 6 pieces
  const holdPiece = game.getHoldPiece();
  const status = game.getStatus();

  // Count piece types in queue
  const pieceCounts: Record<string, number> = {
    I: 0, O: 0, T: 0, S: 0, Z: 0, L: 0, J: 0
  };

  for (const pieceType of queue) {
    if (pieceType) {
      pieceCounts[pieceType] = (pieceCounts[pieceType] ?? 0) + 1;
    }
  }

  // Include hold piece
  if (holdPiece) {
    pieceCounts[holdPiece] = (pieceCounts[holdPiece] ?? 0) + 1;
  }

  // Normalize counts (0-7 pieces possible in queue+hold)
  const normalized: Record<string, number> = {};
  for (const [type, count] of Object.entries(pieceCounts)) {
    normalized[`has_${type.toLowerCase()}`] = count > 0 ? 1 : 0;
    normalized[`count_${type.toLowerCase()}`] = count / 7;
  }

  // Special piece indicators
  normalized.has_i_piece = (pieceCounts['I'] ?? 0) > 0 ? 1 : 0;  // For Tetris
  normalized.has_t_piece = (pieceCounts['T'] ?? 0) > 0 ? 1 : 0;  // For T-Spin
  normalized.has_hold = holdPiece ? 1 : 0;
  normalized.hold_available = !status.holdLocked ? 1 : 0;

  // Queue diversity (how many different piece types)
  const uniqueTypes = new Set(queue.filter(p => p)).size;
  normalized.queue_diversity = uniqueTypes / 7;

  return normalized;
}

/**
 * Compute versus-mode specific features
 */
function computeVersusFeatures(
  game: TetrisGame,
  context: VersusContext
): Record<string, number> {
  const features: Record<string, number> = {};

  // Opponent state
  if (context.opponentHeight !== undefined) {
    features.opponent_height = context.opponentHeight;
  }
  if (context.opponentHoles !== undefined) {
    features.opponent_holes = context.opponentHoles;
  }

  // Garbage dynamics
  if (context.incomingGarbage !== undefined) {
    features.incoming_garbage = Math.min(context.incomingGarbage / 20, 1);  // Normalize
    features.has_incoming = context.incomingGarbage > 0 ? 1 : 0;
  }
  if (context.outgoingGarbage !== undefined) {
    features.outgoing_garbage = Math.min(context.outgoingGarbage / 20, 1);
    features.garbage_sent = features.outgoing_garbage;  // Alias
  }
  if (context.canCancel !== undefined) {
    features.can_cancel = context.canCancel ? 1 : 0;
  }

  // Opponent pressure
  if (context.opponentBackToBack !== undefined) {
    features.opponent_b2b = context.opponentBackToBack ? 1 : 0;
  }
  if (context.opponentCombo !== undefined) {
    features.opponent_combo = Math.min(context.opponentCombo / 10, 1);
  }

  // Height differential (positive = we're lower/winning)
  if (context.opponentHeight !== undefined) {
    const board = game.getBoard();
    const ourHeight = board.cells
      .slice(2)  // Skip hidden rows
      .reduce((max, row, idx) => {
        const hasBlock = row.some(cell => cell !== 0);
        return hasBlock ? Math.max(max, 20 - idx) : max;
      }, 0) / 20;

    features.height_advantage = context.opponentHeight - ourHeight;
  }

  // Threat level (high when opponent has advantages)
  const threatLevel = calculateThreatLevel(game, context);
  features.threat_level = threatLevel;

  return features;
}

/**
 * Calculate threat level from opponent state
 */
function calculateThreatLevel(game: TetrisGame, context: VersusContext): number {
  let threat = 0;

  // Incoming garbage threat
  if (context.incomingGarbage !== undefined) {
    threat += Math.min(context.incomingGarbage / 10, 0.5);
  }

  // Opponent combo threat
  if (context.opponentCombo !== undefined && context.opponentCombo > 0) {
    threat += Math.min(context.opponentCombo / 20, 0.3);
  }

  // Opponent B2B threat
  if (context.opponentBackToBack) {
    threat += 0.2;
  }

  // Height disadvantage threat
  if (context.opponentHeight !== undefined) {
    const board = game.getBoard();
    const ourHeight = board.cells
      .slice(2)
      .reduce((max, row, idx) => {
        const hasBlock = row.some(cell => cell !== 0);
        return hasBlock ? Math.max(max, 20 - idx) : max;
      }, 0) / 20;

    if (ourHeight > context.opponentHeight) {
      threat += (ourHeight - context.opponentHeight) * 0.5;
    }
  }

  return Math.min(threat, 1);
}

/**
 * Compute attack potential (ability to send garbage)
 */
function computeAttackPotential(game: TetrisGame): number {
  const stats = game.getStats();
  const board = game.getBoard();
  let potential = 0;

  // B2B active increases potential
  if (stats.backToBack) {
    potential += 0.3;
  }

  // Combo increases potential
  if (stats.combo > 0) {
    potential += Math.min(stats.combo / 10, 0.4);
  }

  // Low board allows for setups
  const maxHeight = board.cells
    .slice(2)
    .reduce((max, row, idx) => {
      const hasBlock = row.some(cell => cell !== 0);
      return hasBlock ? Math.max(max, 20 - idx) : max;
    }, 0);

  if (maxHeight < 10) {
    potential += 0.3;
  }

  return Math.min(potential, 1);
}

/**
 * Calculate garbage sent based on line clear
 * Matches standard Tetris versus rules
 */
export function calculateGarbageSent(clearResult: {
  linesCleared: number;
  clearType: string;
  perfectClear: boolean;
}, backToBack: boolean, combo: number): number {
  let garbage = 0;

  // Base garbage from line clear
  if (clearResult.clearType.includes('tetris')) {
    garbage = 4;
  } else if (clearResult.clearType.includes('tspin')) {
    if (clearResult.clearType.includes('mini')) {
      garbage = clearResult.linesCleared === 0 ? 0 : clearResult.linesCleared;
    } else {
      garbage = clearResult.linesCleared * 2;
    }
  } else {
    // Normal clears
    garbage = Math.max(0, clearResult.linesCleared - 1);
  }

  // Back-to-back bonus
  if (backToBack && (clearResult.clearType.includes('tetris') ||
                      clearResult.clearType.includes('tspin'))) {
    garbage += 1;
  }

  // Combo bonus
  if (combo > 1) {
    const comboBonus = Math.floor(combo / 2);
    garbage += comboBonus;
  }

  // Perfect Clear massive bonus
  if (clearResult.perfectClear) {
    garbage += 10;
  }

  return garbage;
}

/**
 * Get feature value by name from feature vector
 */
export function getFeatureValue(features: FeatureVector | ExtendedFeatureVector, name: string): number {
  return features.values[name] ?? 0;
}

/**
 * Create feature vector from values
 */
export function createFeatureVector(values: Record<string, number>): ExtendedFeatureVector {
  return { values };
}
