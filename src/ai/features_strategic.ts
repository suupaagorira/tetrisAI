/**
 * Strategic Feature Extraction
 *
 * Adds strategy-aware features for meta-level learning.
 * These features help the agent learn when to switch strategies
 * and evaluate strategic decision-making.
 */

import { TetrisGame } from '../core/game.js';
import { PieceType } from '../core/types.js';
import { FeatureVector, computeFeatures } from './features.js';
import { computeExtendedFeatures, VersusContext } from './features_extended.js';
import { StrategyType } from './strategy.js';
import { detectTSpinOpportunities, analyzeColumns, collectVisibleRows } from './features.js';

/**
 * Strategic context for feature extraction
 */
export interface StrategicContext {
  /** Current active strategy */
  currentStrategy: StrategyType;

  /** How long current strategy has been active (milliseconds) */
  strategyDuration: number;

  /** Number of strategy switches in this episode */
  strategySwitchCount: number;

  /** Whether the last strategy achieved its goals */
  lastStrategySuccess: boolean;

  /** Versus context (if in versus mode) */
  versusContext?: VersusContext;
}

/**
 * Strategic feature vector with meta-level features
 */
export interface StrategicFeatureVector extends FeatureVector {
  readonly values: Record<string, number>;
}

/**
 * Compute strategic features for meta-learning
 */
export function computeStrategicFeatures(
  game: TetrisGame,
  dropDistance: number,
  isGameOver: boolean,
  strategicContext?: StrategicContext
): StrategicFeatureVector {
  // Get extended features (includes base + versus features)
  const extendedFeatures = computeExtendedFeatures(
    game,
    dropDistance,
    isGameOver,
    strategicContext?.versusContext
  );

  // Add strategic meta-features
  const strategicMetaFeatures = strategicContext
    ? computeStrategicMetaFeatures(game, strategicContext)
    : {};

  // Add strategy-specific opportunity features
  const opportunityFeatures = computeOpportunityFeatures(game);

  // Add relative advantage features (versus mode only)
  const advantageFeatures = strategicContext?.versusContext
    ? computeAdvantageFeatures(game, strategicContext.versusContext)
    : {};

  const allValues = {
    ...extendedFeatures.values,
    ...strategicMetaFeatures,
    ...opportunityFeatures,
    ...advantageFeatures,
  };

  return { values: allValues };
}

/**
 * Compute meta-features about strategy usage and performance
 */
function computeStrategicMetaFeatures(
  game: TetrisGame,
  context: StrategicContext
): Record<string, number> {
  // Normalize strategy duration (0-1, max 30 seconds)
  const maxDuration = 30000; // 30 seconds
  const normalizedDuration = Math.min(context.strategyDuration / maxDuration, 1);

  // Normalize switch count (0-1, max 20 switches per episode)
  const maxSwitches = 20;
  const normalizedSwitches = Math.min(context.strategySwitchCount / maxSwitches, 1);

  return {
    // Strategy history
    current_strategy_duration: normalizedDuration,
    strategy_switch_count: normalizedSwitches,
    last_strategy_success: context.lastStrategySuccess ? 1 : 0,

    // Current strategy indicators (one-hot encoding)
    strategy_is_b2b_pressure: context.currentStrategy === StrategyType.B2B_PRESSURE ? 1 : 0,
    strategy_is_defense: context.currentStrategy === StrategyType.DEFENSE_CANCEL ? 1 : 0,
    strategy_is_pc: context.currentStrategy === StrategyType.PC_UTILIZATION ? 1 : 0,
    strategy_is_4wide: context.currentStrategy === StrategyType.FOURWIDE_DOMINANCE ? 1 : 0,
    strategy_is_cheese: context.currentStrategy === StrategyType.CHEESE_FARMING ? 1 : 0,
    strategy_is_tempo: context.currentStrategy === StrategyType.TEMPO_DELAY ? 1 : 0,
  };
}

/**
 * Compute strategy opportunity features
 */
function computeOpportunityFeatures(game: TetrisGame): Record<string, number> {
  const board = game.getBoard();
  const visibleRows = collectVisibleRows(board);
  const metrics = analyzeColumns(visibleRows);
  const maxHeight = metrics.heights.length > 0 ? Math.max(...metrics.heights) : 0;
  const stats = game.getStats();
  const queue = game.getNextQueue().slice(0, 6);
  const holdPiece = game.getHoldPiece();

  // T-Spin opportunity detection
  const tspinOpportunities = detectTSpinOpportunities(visibleRows, metrics.heights);
  const tspinAvailability = Math.min(tspinOpportunities / 3, 1); // Normalize to 0-1

  // Combo potential (based on current combo and board state)
  const comboActive = stats.combo > 0;
  const lowHeight = maxHeight < visibleRows.length * 0.6;
  const comboPotential = comboActive && lowHeight ? Math.min((stats.combo + 5) / 15, 1) : 0;

  // Perfect Clear feasibility
  const boardHeight = maxHeight / visibleRows.length;
  const occupancy = countOccupiedCells(visibleRows) / (board.width * visibleRows.length);
  const pcFeasibility = boardHeight <= 0.3 && occupancy <= 0.3 && metrics.holes === 0 ? 0.8 : 0;

  // 4-Wide setup feasibility
  const fourWidePotential = analyzeFourWidePotential(visibleRows, metrics);

  // B2B chain sustainability
  const b2bActive = stats.backToBack;
  const hasTetrisSetup = hasIPiecePlacement(queue, holdPiece);
  const b2bSustainability = b2bActive && hasTetrisSetup ? 0.8 : b2bActive ? 0.5 : 0.2;

  // Downstack urgency
  const downstackUrgency = maxHeight > visibleRows.length * 0.75 ? 1 :
                           maxHeight > visibleRows.length * 0.5 ? 0.5 : 0;

  return {
    tspin_availability: tspinAvailability,
    combo_potential: comboPotential,
    pc_feasibility: pcFeasibility,
    four_wide_potential: fourWidePotential,
    b2b_sustainability: b2bSustainability,
    downstack_urgency: downstackUrgency,
  };
}

/**
 * Compute relative advantage features for versus mode
 */
function computeAdvantageFeatures(
  game: TetrisGame,
  versusContext: VersusContext
): Record<string, number> {
  const board = game.getBoard();
  const visibleRows = collectVisibleRows(board);
  const metrics = analyzeColumns(visibleRows);
  const myHeight = metrics.heights.length > 0 ? Math.max(...metrics.heights) : 0;
  const myHoles = metrics.holes;
  const stats = game.getStats();

  const opponentHeight = versusContext.opponentHeight ?? 0.5;
  const opponentHoles = versusContext.opponentHoles ?? 0.5;
  const incomingGarbage = versusContext.incomingGarbage ?? 0;
  const canCancel = versusContext.canCancel ?? false;

  // Height advantage (positive = we're lower, better position)
  const normalizedMyHeight = myHeight / visibleRows.length;
  const heightAdvantage = opponentHeight - normalizedMyHeight; // -1 to 1

  // Cleanliness advantage
  const normalizedMyHoles = myHoles / (board.width * visibleRows.length);
  const cleanlinessAdvantage = opponentHoles - normalizedMyHoles; // -1 to 1

  // Overall positional advantage
  const relativeAdvantage = (heightAdvantage * 0.6 + cleanlinessAdvantage * 0.4);

  // Opponent vulnerability (they're in danger)
  const opponentVulnerable = opponentHeight > 0.75 ? 1 : opponentHeight > 0.5 ? 0.5 : 0;

  // Tempo control (who has initiative)
  const weAreAttacking = stats.combo > 0 || stats.backToBack;
  const weAreDefending = incomingGarbage > 0;
  const tempoControl = weAreAttacking && !weAreDefending ? 1 :
                       !weAreAttacking && weAreDefending ? 0 : 0.5;

  // Strategic pressure (combined metric)
  const strategicPressure = weAreAttacking && opponentVulnerable ? 1 :
                            weAreAttacking ? 0.7 :
                            opponentVulnerable ? 0.5 : 0.3;

  // Garbage management
  const normalizedIncoming = Math.min(incomingGarbage / 20, 1);
  const garbageThreat = canCancel ? normalizedIncoming * 0.5 : normalizedIncoming;

  return {
    relative_advantage: Math.max(-1, Math.min(1, relativeAdvantage)),
    opponent_vulnerability: opponentVulnerable,
    tempo_control: tempoControl,
    strategic_pressure: strategicPressure,
    garbage_threat: garbageThreat,
    height_advantage: Math.max(-1, Math.min(1, heightAdvantage)),
    cleanliness_advantage: Math.max(-1, Math.min(1, cleanlinessAdvantage)),
  };
}

/**
 * Helper: Count occupied cells in visible rows
 */
function countOccupiedCells(rows: number[][]): number {
  let count = 0;
  for (const row of rows) {
    for (const cell of row) {
      if (cell !== 0) count++;
    }
  }
  return count;
}

/**
 * Helper: Analyze 4-wide potential
 */
function analyzeFourWidePotential(rows: number[][], metrics: { heights: number[]; holes: number }): number {
  if (metrics.holes > 2) return 0; // Too many holes

  const maxHeight = metrics.heights.length > 0 ? Math.max(...metrics.heights) : 0;
  if (maxHeight > rows.length * 0.6) return 0; // Too high

  // Look for 4 consecutive columns with similar heights
  for (let x = 0; x <= metrics.heights.length - 4; x++) {
    const fourColumns = metrics.heights.slice(x, x + 4);
    const avgHeight = fourColumns.reduce((a, b) => a + b, 0) / 4;
    const variance = fourColumns.reduce((sum, h) => sum + Math.abs(h - avgHeight), 0) / 4;

    if (variance < 2) { // Relatively flat
      return Math.min(1, 0.3 + (1 - avgHeight / rows.length) * 0.7);
    }
  }

  return 0.1; // Minimal potential
}

/**
 * Helper: Check if I piece is available for Tetris
 */
function hasIPiecePlacement(queue: readonly PieceType[], holdPiece: PieceType | null): boolean {
  // Check hold piece
  if (holdPiece === 'I') return true;

  // Check next 3 pieces in queue
  for (let i = 0; i < Math.min(3, queue.length); i++) {
    if (queue[i] === 'I') return true;
  }

  return false;
}
