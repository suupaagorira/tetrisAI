/**
 * Strategic Reward Computation
 *
 * Defines reward functions for strategic learning, including:
 * - Action-level rewards (immediate score gains)
 * - Strategy-level rewards (strategic goal achievement)
 * - Diversity bonuses (to prevent over-specialization)
 */

import { GameStats } from '../core/types.js';
import { StrategyType } from '../ai/strategy.js';
import { VersusContext } from '../ai/features_extended.js';

/**
 * Game state snapshot for reward computation
 */
export interface GameStateSnapshot {
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  maxHeight: number;
  holes: number;
  occupancy: number;
  garbageSent: number;
  garbageCancelled: number;
  garbageReceived: number;
  totalPieces: number;
}

/**
 * Reward components for analysis
 */
export interface RewardBreakdown {
  actionReward: number;
  strategyGoalReward: number;
  versusReward: number;
  diversityBonus: number;
  total: number;
}

/**
 * Episode history for diversity computation
 */
export interface EpisodeHistory {
  strategiesUsed: StrategyType[];
  recentStrategies: StrategyType[]; // Last 10 strategies
}

/**
 * Compute action-level reward (immediate score/progress)
 */
export function computeActionReward(
  before: GameStateSnapshot,
  after: GameStateSnapshot
): number {
  let reward = 0;

  // Score gain (primary reward)
  const scoreGain = after.score - before.score;
  reward += scoreGain * 0.01; // Scale down to reasonable range

  // Line clears
  const linesCleared = after.lines - before.lines;
  reward += linesCleared * 10;

  // Combo bonus
  if (after.combo > 0) {
    reward += after.combo * 5;
  }

  // B2B bonus
  if (after.backToBack && !before.backToBack) {
    reward += 20; // B2B started
  } else if (after.backToBack) {
    reward += 10; // B2B continued
  }

  // Height penalty (discourage dangerous heights)
  const heightPenalty = (after.maxHeight - before.maxHeight) * -2;
  reward += heightPenalty;

  // Hole penalty
  const holePenalty = (after.holes - before.holes) * -5;
  reward += holePenalty;

  return reward;
}

/**
 * Compute strategy-level reward (strategic goal achievement)
 */
export function computeStrategyGoalReward(
  strategy: StrategyType,
  before: GameStateSnapshot,
  after: GameStateSnapshot
): number {
  let reward = 0;

  switch (strategy) {
    case StrategyType.B2B_PRESSURE:
      // Reward: B2B chain maintenance and special moves
      if (after.backToBack) {
        reward += 30;
        // Bonus for extending B2B
        if (before.backToBack) {
          reward += 20;
        }
      } else if (before.backToBack) {
        // Penalty for breaking B2B
        reward -= 30;
      }

      // Reward Tetris and T-Spins
      const linesCleared = after.lines - before.lines;
      if (linesCleared === 4) reward += 50; // Tetris
      if (linesCleared === 2 || linesCleared === 3) reward += 40; // Likely T-Spin

      break;

    case StrategyType.DEFENSE_CANCEL:
      // Reward: Garbage cancellation and height reduction
      if (after.garbageCancelled > before.garbageCancelled) {
        const cancelled = after.garbageCancelled - before.garbageCancelled;
        reward += cancelled * 50; // High reward for cancelling
      }

      // Reward height reduction
      if (after.maxHeight < before.maxHeight) {
        reward += (before.maxHeight - after.maxHeight) * 10;
      }

      // Penalty for increasing holes
      if (after.holes > before.holes) {
        reward -= (after.holes - before.holes) * 15;
      }

      break;

    case StrategyType.PC_UTILIZATION:
      // Reward: Perfect clear achievement
      if (after.maxHeight === 0 && before.maxHeight > 0) {
        reward += 500; // Massive bonus for PC
      }

      // Reward maintaining low height
      if (after.maxHeight <= 6) {
        reward += 20;
      }

      // Strong penalty for holes (PC requires clean board)
      if (after.holes > 0) {
        reward -= after.holes * 20;
      }

      break;

    case StrategyType.FOUR_WIDE_DOMINANCE:
      // Reward: Combo maintenance and extension
      if (after.combo > before.combo) {
        reward += (after.combo - before.combo) * 30;
      } else if (after.combo > 0) {
        reward += after.combo * 10; // Continuing combo
      } else if (before.combo > 0) {
        reward -= 40; // Broke combo
      }

      // Reward for lines cleared (combos come from clearing)
      const linesInCombo = after.lines - before.lines;
      if (linesInCombo > 0 && after.combo > 0) {
        reward += linesInCombo * 15;
      }

      break;

    case StrategyType.CHEESE_FARMING:
      // Reward: Maximize garbage sent
      const garbageSent = after.garbageSent - before.garbageSent;
      reward += garbageSent * 80; // High reward for sending garbage

      // Bonus for Tetris and T-Spins (high garbage moves)
      const lines = after.lines - before.lines;
      if (lines === 4) reward += 60; // Tetris
      if (lines === 2 || lines === 3) reward += 50; // T-Spin

      // B2B bonus (doubles garbage)
      if (after.backToBack) {
        reward += 30;
      }

      break;

    case StrategyType.TEMPO_DELAY:
      // Reward: Safe play, height control, minimal risks
      if (after.maxHeight < before.maxHeight) {
        reward += (before.maxHeight - after.maxHeight) * 15;
      }

      // Reward maintaining low height
      if (after.maxHeight <= 10) {
        reward += 20;
      }

      // Penalty for creating holes
      if (after.holes > before.holes) {
        reward -= (after.holes - before.holes) * 10;
      }

      // Small reward for any lines cleared
      const linesCleared2 = after.lines - before.lines;
      reward += linesCleared2 * 5;

      break;
  }

  return reward;
}

/**
 * Compute versus-mode reward (competitive dynamics)
 */
export function computeVersusReward(
  before: GameStateSnapshot,
  after: GameStateSnapshot,
  versusContext: VersusContext
): number {
  let reward = 0;

  // Garbage sent (attacking)
  const garbageSent = after.garbageSent - before.garbageSent;
  reward += garbageSent * 50;

  // Garbage cancelled (defending)
  const garbageCancelled = after.garbageCancelled - before.garbageCancelled;
  reward += garbageCancelled * 30;

  // Kill window exploitation (opponent vulnerable, send big attack)
  const opponentHeight = versusContext.opponentHeight ?? 0.5;
  const opponentVulnerable = opponentHeight > 0.75;

  if (opponentVulnerable && garbageSent >= 4) {
    reward += 200; // Big bonus for attacking vulnerable opponent
  }

  // Relative height advantage
  const myHeight = after.maxHeight / 20; // Normalize to 0-1
  const heightAdvantage = opponentHeight - myHeight;

  if (heightAdvantage > 0.2) {
    // We're significantly lower = good
    reward += heightAdvantage * 50;
  } else if (heightAdvantage < -0.2) {
    // We're significantly higher = bad
    reward += heightAdvantage * 100; // Larger penalty
  }

  // Tempo control (maintaining offensive pressure)
  const weAreAttacking = after.combo > 0 || after.backToBack;
  const incomingGarbage = versusContext.incomingGarbage ?? 0;
  const weAreDefending = incomingGarbage > 3;

  if (weAreAttacking && !weAreDefending) {
    reward += 30; // Controlling tempo
  } else if (weAreDefending && !weAreAttacking) {
    reward -= 20; // Losing tempo
  }

  return reward;
}

/**
 * Compute diversity bonus to encourage exploration
 */
export function computeDiversityBonus(
  currentStrategy: StrategyType,
  episodeHistory: EpisodeHistory
): number {
  // Count how many times current strategy has been used recently
  const recentUses = episodeHistory.recentStrategies.filter(
    (s) => s === currentStrategy
  ).length;

  // Penalize over-use of same strategy
  if (recentUses > 7) {
    return -10;
  } else if (recentUses > 5) {
    return -5;
  } else if (recentUses <= 2) {
    return 5; // Bonus for using less-used strategies
  }

  return 0;
}

/**
 * Compute total strategic reward with breakdown
 */
export function computeStrategicReward(
  strategy: StrategyType,
  before: GameStateSnapshot,
  after: GameStateSnapshot,
  episodeHistory: EpisodeHistory,
  versusContext?: VersusContext
): RewardBreakdown {
  const actionReward = computeActionReward(before, after);
  const strategyGoalReward = computeStrategyGoalReward(strategy, before, after);
  const versusReward = versusContext
    ? computeVersusReward(before, after, versusContext)
    : 0;
  const diversityBonus = computeDiversityBonus(strategy, episodeHistory);

  const total = actionReward + strategyGoalReward + versusReward + diversityBonus;

  return {
    actionReward,
    strategyGoalReward,
    versusReward,
    diversityBonus,
    total,
  };
}

/**
 * Compute terminal reward (end of episode)
 */
export function computeTerminalReward(
  won: boolean | undefined,
  finalStats: GameStateSnapshot
): number {
  if (won === undefined) {
    // Solo mode - reward based on final score and survival time
    return finalStats.score * 0.001 + finalStats.totalPieces * 0.5;
  }

  // Versus mode - win/loss bonus
  if (won) {
    return 1000; // Win bonus
  } else {
    return -1000; // Loss penalty
  }
}

/**
 * Create a game state snapshot
 */
export function createSnapshot(
  stats: GameStats,
  maxHeight: number,
  holes: number,
  occupancy: number,
  garbageSent: number = 0,
  garbageCancelled: number = 0,
  garbageReceived: number = 0
): GameStateSnapshot {
  return {
    score: stats.score,
    lines: stats.lines,
    level: stats.level,
    combo: stats.combo,
    backToBack: stats.backToBack,
    maxHeight,
    holes,
    occupancy,
    garbageSent,
    garbageCancelled,
    garbageReceived,
    totalPieces: stats.totalPieces,
  };
}
