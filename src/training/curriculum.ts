/**
 * Curriculum Learning System
 *
 * Implements progressive difficulty scaling for training strategic agents.
 * Agents advance through stages as they demonstrate competency.
 */

import { StrategyType } from '../ai/strategy.js';

/**
 * Curriculum stage definition
 */
export interface CurriculumStage {
  /** Stage name */
  name: string;

  /** Stage difficulty level (0-1) */
  difficulty: number;

  /** Opponent strength (0-1, affects piece RNG and decision quality) */
  opponentStrength: number;

  /** Strategies that opponents will use */
  opponentStrategies: StrategyType[];

  /** Required win rate to advance to next stage */
  requiredWinRate: number;

  /** Minimum episodes before advancement check */
  minEpisodes: number;

  /** Maximum episodes before forced advancement (0 = no limit) */
  maxEpisodes: number;

  /** Description */
  description: string;
}

/**
 * Default curriculum for strategic learning
 */
export const DEFAULT_CURRICULUM: CurriculumStage[] = [
  {
    name: 'Novice',
    difficulty: 0.2,
    opponentStrength: 0.2,
    opponentStrategies: [StrategyType.TEMPO_DELAY],
    requiredWinRate: 0.7,
    minEpisodes: 100,
    maxEpisodes: 500,
    description: 'Learn basics against passive opponents using safe strategies',
  },
  {
    name: 'Beginner',
    difficulty: 0.4,
    opponentStrength: 0.4,
    opponentStrategies: [
      StrategyType.TEMPO_DELAY,
      StrategyType.DEFENSE_CANCEL,
    ],
    requiredWinRate: 0.65,
    minEpisodes: 150,
    maxEpisodes: 600,
    description: 'Face opponents who balance offense and defense',
  },
  {
    name: 'Intermediate',
    difficulty: 0.6,
    opponentStrength: 0.6,
    opponentStrategies: [
      StrategyType.B2B_PRESSURE,
      StrategyType.DEFENSE_CANCEL,
      StrategyType.CHEESE_FARMING,
    ],
    requiredWinRate: 0.6,
    minEpisodes: 200,
    maxEpisodes: 800,
    description: 'Handle aggressive B2B and cheese strategies',
  },
  {
    name: 'Advanced',
    difficulty: 0.8,
    opponentStrength: 0.8,
    opponentStrategies: [
      StrategyType.B2B_PRESSURE,
      StrategyType.FOURWIDE_DOMINANCE,
      StrategyType.CHEESE_FARMING,
      StrategyType.PC_UTILIZATION,
    ],
    requiredWinRate: 0.55,
    minEpisodes: 300,
    maxEpisodes: 1000,
    description: 'Master complex strategies including 4-wide and PC',
  },
  {
    name: 'Expert',
    difficulty: 1.0,
    opponentStrength: 1.0,
    opponentStrategies: Object.values(StrategyType), // All strategies
    requiredWinRate: 0.5,
    minEpisodes: 500,
    maxEpisodes: 0, // No limit
    description: 'Compete against opponents using all strategies adaptively',
  },
];

/**
 * Curriculum progress tracker
 */
export class CurriculumProgress {
  private currentStageIndex: number;
  private stageEpisodes: number;
  private stageWins: number;
  private stageLosses: number;
  private totalEpisodes: number;
  private curriculum: CurriculumStage[];

  constructor(curriculum: CurriculumStage[] = DEFAULT_CURRICULUM) {
    this.curriculum = curriculum;
    this.currentStageIndex = 0;
    this.stageEpisodes = 0;
    this.stageWins = 0;
    this.stageLosses = 0;
    this.totalEpisodes = 0;
  }

  /**
   * Get current stage
   */
  getCurrentStage(): CurriculumStage {
    return this.curriculum[this.currentStageIndex]!;
  }

  /**
   * Get current stage index
   */
  getCurrentStageIndex(): number {
    return this.currentStageIndex;
  }

  /**
   * Get total number of stages
   */
  getTotalStages(): number {
    return this.curriculum.length;
  }

  /**
   * Record an episode result
   */
  recordEpisode(won: boolean): {
    advanced: boolean;
    previousStage?: CurriculumStage;
    newStage?: CurriculumStage;
  } {
    this.stageEpisodes++;
    this.totalEpisodes++;

    if (won) {
      this.stageWins++;
    } else {
      this.stageLosses++;
    }

    // Check if we should advance
    const shouldAdvance = this.shouldAdvance();

    if (shouldAdvance && this.currentStageIndex < this.curriculum.length - 1) {
      const previousStage = this.getCurrentStage();
      this.currentStageIndex++;
      const newStage = this.getCurrentStage();

      // Reset stage counters
      this.stageEpisodes = 0;
      this.stageWins = 0;
      this.stageLosses = 0;

      return {
        advanced: true,
        previousStage,
        newStage,
      };
    }

    return { advanced: false };
  }

  /**
   * Check if agent should advance to next stage
   */
  private shouldAdvance(): boolean {
    const stage = this.getCurrentStage();

    // Must meet minimum episodes
    if (this.stageEpisodes < stage.minEpisodes) {
      return false;
    }

    // Calculate win rate
    const totalGames = this.stageWins + this.stageLosses;
    if (totalGames === 0) {
      return false;
    }

    const winRate = this.stageWins / totalGames;

    // Check if win rate requirement is met
    if (winRate >= stage.requiredWinRate) {
      return true;
    }

    // Force advancement if max episodes reached
    if (stage.maxEpisodes > 0 && this.stageEpisodes >= stage.maxEpisodes) {
      return true;
    }

    return false;
  }

  /**
   * Get current win rate for this stage
   */
  getCurrentWinRate(): number {
    const totalGames = this.stageWins + this.stageLosses;
    if (totalGames === 0) {
      return 0;
    }
    return this.stageWins / totalGames;
  }

  /**
   * Get stage progress (0-1)
   */
  getStageProgress(): number {
    const stage = this.getCurrentStage();

    // Progress based on episodes completed
    const episodeProgress = Math.min(this.stageEpisodes / stage.minEpisodes, 1);

    // Progress based on win rate
    const winRate = this.getCurrentWinRate();
    const winRateProgress = Math.min(winRate / stage.requiredWinRate, 1);

    // Combined progress (both must be satisfied)
    return Math.min(episodeProgress, winRateProgress);
  }

  /**
   * Get overall curriculum progress (0-1)
   */
  getOverallProgress(): number {
    const stageWeight = 1 / this.curriculum.length;
    const completedStages = this.currentStageIndex;
    const currentStageProgress = this.getStageProgress();

    return (completedStages + currentStageProgress) * stageWeight;
  }

  /**
   * Get statistics
   */
  getStats(): {
    currentStage: string;
    stageIndex: number;
    totalStages: number;
    stageEpisodes: number;
    stageWins: number;
    stageLosses: number;
    stageWinRate: number;
    stageProgress: number;
    overallProgress: number;
    totalEpisodes: number;
  } {
    const stage = this.getCurrentStage();

    return {
      currentStage: stage.name,
      stageIndex: this.currentStageIndex,
      totalStages: this.curriculum.length,
      stageEpisodes: this.stageEpisodes,
      stageWins: this.stageWins,
      stageLosses: this.stageLosses,
      stageWinRate: this.getCurrentWinRate(),
      stageProgress: this.getStageProgress(),
      overallProgress: this.getOverallProgress(),
      totalEpisodes: this.totalEpisodes,
    };
  }

  /**
   * Reset to beginning
   */
  reset(): void {
    this.currentStageIndex = 0;
    this.stageEpisodes = 0;
    this.stageWins = 0;
    this.stageLosses = 0;
    this.totalEpisodes = 0;
  }

  /**
   * Skip to a specific stage
   */
  skipToStage(stageIndex: number): void {
    if (stageIndex >= 0 && stageIndex < this.curriculum.length) {
      this.currentStageIndex = stageIndex;
      this.stageEpisodes = 0;
      this.stageWins = 0;
      this.stageLosses = 0;
    }
  }

  /**
   * Serialize to JSON
   */
  toJSON(): {
    currentStageIndex: number;
    stageEpisodes: number;
    stageWins: number;
    stageLosses: number;
    totalEpisodes: number;
  } {
    return {
      currentStageIndex: this.currentStageIndex,
      stageEpisodes: this.stageEpisodes,
      stageWins: this.stageWins,
      stageLosses: this.stageLosses,
      totalEpisodes: this.totalEpisodes,
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data: {
    currentStageIndex: number;
    stageEpisodes: number;
    stageWins: number;
    stageLosses: number;
    totalEpisodes: number;
  }): void {
    this.currentStageIndex = data.currentStageIndex;
    this.stageEpisodes = data.stageEpisodes;
    this.stageWins = data.stageWins;
    this.stageLosses = data.stageLosses;
    this.totalEpisodes = data.totalEpisodes;
  }
}

/**
 * Opponent configuration based on curriculum stage
 */
export interface OpponentConfig {
  /** Strategies the opponent can use */
  strategies: StrategyType[];

  /** Opponent skill level (0-1) */
  skillLevel: number;

  /** Action exploration rate (higher = more random) */
  explorationRate: number;

  /** Strategy switching frequency (lower = more stable) */
  strategySwitchRate: number;
}

/**
 * Create opponent configuration from curriculum stage
 */
export function createOpponentConfig(stage: CurriculumStage): OpponentConfig {
  return {
    strategies: stage.opponentStrategies,
    skillLevel: stage.opponentStrength,
    // Higher skill = less exploration (more deterministic)
    explorationRate: Math.max(0.05, 0.3 * (1 - stage.opponentStrength)),
    // Higher skill = more dynamic strategy switching
    strategySwitchRate: 0.1 + stage.opponentStrength * 0.2,
  };
}
