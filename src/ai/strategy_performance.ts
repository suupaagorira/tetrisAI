/**
 * Strategy Performance Tracking
 *
 * Tracks performance metrics for each strategy to enable meta-learning
 * and strategic decision-making in the learnable strategic agent.
 */

import { StrategyType } from './strategy.js';

/**
 * Performance statistics for a single strategy
 */
export interface StrategyPerformance {
  /** Number of times this strategy was used */
  timesUsed: number;

  /** Average score achieved while using this strategy */
  averageScore: number;

  /** Win rate when using this strategy (versus mode only) */
  winRate: number;

  /** Total garbage lines sent while using this strategy */
  totalGarbageSent: number;

  /** Average garbage sent per use */
  averageGarbageSent: number;

  /** Average number of moves before game over */
  avgMovesBeforeDeath: number;

  /** Timestamp of last use (milliseconds) */
  lastUsedTimestamp: number;

  /** Total reward accumulated with this strategy */
  totalReward: number;

  /** Average reward per move */
  averageReward: number;

  /** Number of wins (versus mode only) */
  wins: number;

  /** Number of losses (versus mode only) */
  losses: number;
}

/**
 * Creates a new empty performance record
 */
export function createEmptyPerformance(): StrategyPerformance {
  return {
    timesUsed: 0,
    averageScore: 0,
    winRate: 0,
    totalGarbageSent: 0,
    averageGarbageSent: 0,
    avgMovesBeforeDeath: 0,
    lastUsedTimestamp: 0,
    totalReward: 0,
    averageReward: 0,
    wins: 0,
    losses: 0,
  };
}

/**
 * Strategy performance tracker that maintains statistics for all strategies
 */
export class StrategyPerformanceTracker {
  private stats: Map<StrategyType, StrategyPerformance>;

  constructor() {
    this.stats = new Map();

    // Initialize stats for all strategy types
    for (const strategyType of Object.values(StrategyType)) {
      this.stats.set(strategyType, createEmptyPerformance());
    }
  }

  /**
   * Records the start of using a strategy
   */
  recordStrategyStart(strategy: StrategyType): void {
    const stats = this.stats.get(strategy)!;
    stats.timesUsed++;
    stats.lastUsedTimestamp = Date.now();
  }

  /**
   * Records the end of using a strategy with performance metrics
   */
  recordStrategyEnd(
    strategy: StrategyType,
    metrics: {
      score: number;
      garbageSent: number;
      moves: number;
      reward: number;
      won?: boolean;
    }
  ): void {
    const stats = this.stats.get(strategy)!;

    // Update running averages
    const n = stats.timesUsed;
    stats.averageScore = (stats.averageScore * (n - 1) + metrics.score) / n;
    stats.avgMovesBeforeDeath = (stats.avgMovesBeforeDeath * (n - 1) + metrics.moves) / n;
    stats.averageReward = (stats.averageReward * (n - 1) + metrics.reward) / n;

    // Update garbage stats
    stats.totalGarbageSent += metrics.garbageSent;
    stats.averageGarbageSent = stats.totalGarbageSent / n;

    // Update total reward
    stats.totalReward += metrics.reward;

    // Update win/loss stats (versus mode only)
    if (metrics.won !== undefined) {
      if (metrics.won) {
        stats.wins++;
      } else {
        stats.losses++;
      }
      stats.winRate = stats.wins / (stats.wins + stats.losses);
    }
  }

  /**
   * Gets performance statistics for a specific strategy
   */
  getPerformance(strategy: StrategyType): StrategyPerformance {
    return { ...this.stats.get(strategy)! };
  }

  /**
   * Gets performance statistics for all strategies
   */
  getAllPerformance(): Map<StrategyType, StrategyPerformance> {
    const result = new Map<StrategyType, StrategyPerformance>();
    for (const [strategy, stats] of this.stats) {
      result.set(strategy, { ...stats });
    }
    return result;
  }

  /**
   * Gets the best performing strategy based on average reward
   */
  getBestStrategy(): StrategyType {
    let bestStrategy = StrategyType.B2B_PRESSURE;
    let bestReward = -Infinity;

    for (const [strategy, stats] of this.stats) {
      if (stats.timesUsed > 0 && stats.averageReward > bestReward) {
        bestReward = stats.averageReward;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  /**
   * Gets the least used strategy (for exploration)
   */
  getLeastUsedStrategy(): StrategyType {
    let leastUsedStrategy = StrategyType.B2B_PRESSURE;
    let minUses = Infinity;

    for (const [strategy, stats] of this.stats) {
      if (stats.timesUsed < minUses) {
        minUses = stats.timesUsed;
        leastUsedStrategy = strategy;
      }
    }

    return leastUsedStrategy;
  }

  /**
   * Resets all statistics
   */
  reset(): void {
    for (const strategy of this.stats.keys()) {
      this.stats.set(strategy, createEmptyPerformance());
    }
  }

  /**
   * Serializes the tracker state to JSON
   */
  toJSON(): Record<string, StrategyPerformance> {
    const result: Record<string, StrategyPerformance> = {};
    for (const [strategy, stats] of this.stats) {
      result[strategy] = stats;
    }
    return result;
  }

  /**
   * Loads tracker state from JSON
   */
  fromJSON(data: Record<string, StrategyPerformance>): void {
    for (const [strategyStr, stats] of Object.entries(data)) {
      const strategy = strategyStr as StrategyType;
      if (this.stats.has(strategy)) {
        this.stats.set(strategy, { ...stats });
      }
    }
  }
}

/**
 * Episode-level strategy usage tracking
 */
export interface StrategyUsageRecord {
  strategy: StrategyType;
  startTimestamp: number;
  endTimestamp: number;
  movesCount: number;
  scoreGain: number;
  garbageSent: number;
  reward: number;
}

/**
 * Tracks strategy usage within a single episode
 */
export class EpisodeStrategyTracker {
  private currentStrategy: StrategyType;
  private currentStrategyStartTime: number;
  private currentStrategyStartMoves: number;
  private currentStrategyStartScore: number;
  private currentStrategyStartGarbage: number;
  private currentStrategyReward: number;

  private history: StrategyUsageRecord[];
  private totalMoves: number;
  private totalScore: number;
  private totalGarbage: number;

  constructor(initialStrategy: StrategyType) {
    this.currentStrategy = initialStrategy;
    this.currentStrategyStartTime = Date.now();
    this.currentStrategyStartMoves = 0;
    this.currentStrategyStartScore = 0;
    this.currentStrategyStartGarbage = 0;
    this.currentStrategyReward = 0;
    this.history = [];
    this.totalMoves = 0;
    this.totalScore = 0;
    this.totalGarbage = 0;
  }

  /**
   * Records a strategy switch
   */
  switchStrategy(
    newStrategy: StrategyType,
    currentMoves: number,
    currentScore: number,
    currentGarbage: number
  ): void {
    // Record the completed strategy usage
    this.history.push({
      strategy: this.currentStrategy,
      startTimestamp: this.currentStrategyStartTime,
      endTimestamp: Date.now(),
      movesCount: currentMoves - this.currentStrategyStartMoves,
      scoreGain: currentScore - this.currentStrategyStartScore,
      garbageSent: currentGarbage - this.currentStrategyStartGarbage,
      reward: this.currentStrategyReward,
    });

    // Update to new strategy
    this.currentStrategy = newStrategy;
    this.currentStrategyStartTime = Date.now();
    this.currentStrategyStartMoves = currentMoves;
    this.currentStrategyStartScore = currentScore;
    this.currentStrategyStartGarbage = currentGarbage;
    this.currentStrategyReward = 0;

    this.totalMoves = currentMoves;
    this.totalScore = currentScore;
    this.totalGarbage = currentGarbage;
  }

  /**
   * Adds reward to the current strategy
   */
  addReward(reward: number): void {
    this.currentStrategyReward += reward;
  }

  /**
   * Finalizes the episode and returns the complete history
   */
  finalize(
    finalMoves: number,
    finalScore: number,
    finalGarbage: number
  ): StrategyUsageRecord[] {
    // Add the final strategy usage
    this.history.push({
      strategy: this.currentStrategy,
      startTimestamp: this.currentStrategyStartTime,
      endTimestamp: Date.now(),
      movesCount: finalMoves - this.currentStrategyStartMoves,
      scoreGain: finalScore - this.currentStrategyStartScore,
      garbageSent: finalGarbage - this.currentStrategyStartGarbage,
      reward: this.currentStrategyReward,
    });

    return this.history;
  }

  /**
   * Gets the current strategy
   */
  getCurrentStrategy(): StrategyType {
    return this.currentStrategy;
  }

  /**
   * Gets the number of strategy switches in this episode
   */
  getSwitchCount(): number {
    return this.history.length;
  }

  /**
   * Gets the usage history
   */
  getHistory(): readonly StrategyUsageRecord[] {
    return this.history;
  }
}
