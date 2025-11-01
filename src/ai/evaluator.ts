import { FeatureVector } from './features';

export interface EvaluatorConfig {
  weights: Record<string, number>;
  bias?: number;
  learningRate?: number;
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  bias: 0,
  lines_cleared: 1.0,
  tetris: 1.5,
  tspin: 2.0,
  tspin_mini: 0.6,
  back_to_back: 0.8,
  combo: 0.8,
  combo_active: 0.2,
  aggregate_height: -0.6,
  max_height: -0.4,
  holes: -0.9,
  bumpiness: -0.3,
  wells: -0.45,
  row_transitions: -0.3,
  column_transitions: -0.35,
  occupancy: -0.1,
  surface_roughness: -0.25,
  drop_distance: -0.05,
  score_gain: 0.1,
  perfect_clear: 5.0,
  wasted_placement: -0.5,
  game_over: -1000,
  gaps: -0.4,
  // New adaptive features
  tspin_opportunity: 1.5,
  reachable_holes: -0.5,
  buried_holes: -1.0,
};

export class LinearEvaluator {
  protected weights: Record<string, number>;
  protected bias: number;
  protected learningRate: number;

  constructor(config: EvaluatorConfig = { weights: DEFAULT_WEIGHTS }) {
    this.weights = { ...config.weights };
    this.bias = config.bias ?? 0;
    this.learningRate = config.learningRate ?? 0.01;
  }

  evaluate(features: FeatureVector): number {
    let value = this.bias;
    for (const [name, featureValue] of Object.entries(features.values)) {
      const weight = this.weights[name] ?? 0;
      value += weight * featureValue;
    }
    return value;
  }

  predict(features: FeatureVector): number {
    return this.evaluate(features);
  }

  train(features: FeatureVector, target: number): void {
    const prediction = this.predict(features);
    const error = target - prediction;
    for (const [name, featureValue] of Object.entries(features.values)) {
      const currentWeight = this.weights[name] ?? 0;
      this.weights[name] = currentWeight + this.learningRate * error * featureValue;
    }
    this.bias += this.learningRate * error;
  }

  getWeights(): Record<string, number> {
    return { ...this.weights };
  }

  setWeights(weights: Record<string, number>): void {
    this.weights = { ...weights };
  }

  setLearningRate(rate: number): void {
    this.learningRate = rate;
  }

  serialize(): EvaluatorConfig {
    return {
      weights: { ...this.weights },
      bias: this.bias,
      learningRate: this.learningRate,
    };
  }
}

export enum PlayMode {
  EMERGENCY = 'emergency',      // High board: prioritize clearing lines
  PERFECT_CLEAR = 'perfect_clear', // Low board: aim for perfect clear
  TSPIN_SETUP = 'tspin_setup',   // Mid board: set up T-Spins
  NORMAL = 'normal',             // Default balanced play
}

export interface BoardAnalysis {
  maxHeight: number;
  avgHeight: number;
  totalBlocks: number;
  playMode: PlayMode;
}

export class AdaptiveEvaluator extends LinearEvaluator {
  private baseWeights: Record<string, number>;

  constructor(config: EvaluatorConfig = { weights: DEFAULT_WEIGHTS }) {
    super(config);
    this.baseWeights = { ...DEFAULT_WEIGHTS };
  }

  /**
   * Analyze board state to determine appropriate play mode
   */
  analyzeBoard(features: FeatureVector): BoardAnalysis {
    const maxHeight = features.values.max_height ?? 0;
    const avgHeight = features.values.aggregate_height ?? 0;
    const occupancy = features.values.occupancy ?? 0;
    const totalBlocks = occupancy * 200; // Approximate (10 width × 20 visible rows)

    // Denormalize heights (features are normalized 0-1)
    const actualMaxHeight = maxHeight * 20; // Assuming 20 visible rows
    const actualAvgHeight = avgHeight * 20;

    let playMode = PlayMode.NORMAL;

    // Emergency mode: board is dangerously high
    if (actualMaxHeight > 15) {
      playMode = PlayMode.EMERGENCY;
    }
    // Perfect clear mode: board is very low and clean
    else if (actualMaxHeight < 4 && totalBlocks < 20) {
      playMode = PlayMode.PERFECT_CLEAR;
    }
    // T-Spin setup mode: mid-height with opportunities
    else if (actualMaxHeight >= 4 && actualMaxHeight <= 15 && features.values.tspin_opportunity) {
      playMode = PlayMode.TSPIN_SETUP;
    }

    return {
      maxHeight: actualMaxHeight,
      avgHeight: actualAvgHeight,
      totalBlocks,
      playMode,
    };
  }

  /**
   * Adjust weights based on board state
   */
  private adjustWeights(analysis: BoardAnalysis): Record<string, number> {
    const weights = { ...this.baseWeights };

    switch (analysis.playMode) {
      case PlayMode.EMERGENCY:
        // EMERGENCY: Prioritize clearing lines and reducing height
        weights.lines_cleared = 5.0;      // 5x boost
        weights.tetris = 3.0;              // 2x boost
        weights.max_height = -1.2;         // 3x penalty
        weights.aggregate_height = -1.8;   // 3x penalty
        weights.holes = -1.8;              // 2x penalty
        weights.gaps = -0.8;               // 2x penalty
        weights.tspin = 1.0;               // Reduce T-Spin priority
        weights.perfect_clear = 1.0;       // Reduce PC priority
        weights.wasted_placement = -1.5;   // 3x penalty for not clearing
        break;

      case PlayMode.PERFECT_CLEAR:
        // PERFECT CLEAR: Aim for clean board
        weights.perfect_clear = 15.0;      // 3x boost
        weights.holes = -2.0;              // Strong penalty
        weights.gaps = -1.5;               // Strong penalty
        weights.bumpiness = -0.9;          // 3x penalty
        weights.surface_roughness = -0.75; // 3x penalty
        weights.lines_cleared = 2.0;       // Moderate boost
        weights.wasted_placement = -0.2;   // Reduce penalty
        weights.occupancy = -0.3;          // Prefer fewer blocks
        break;

      case PlayMode.TSPIN_SETUP:
        // T-SPIN SETUP: Prioritize T-Spin opportunities
        weights.tspin = 4.0;               // 2x boost
        weights.tspin_opportunity = 2.5;   // New feature weight
        weights.tspin_mini = 1.2;          // 2x boost
        weights.back_to_back = 1.5;        // Boost for B2B
        weights.combo = 1.2;               // Boost combos
        weights.reachable_holes = -0.3;    // Slight penalty (controlled holes OK)
        weights.buried_holes = -1.2;       // Strong penalty
        break;

      case PlayMode.NORMAL:
      default:
        // NORMAL: Balanced play (use base weights)
        break;
    }

    return weights;
  }

  /**
   * Evaluate with adaptive weights based on board state
   */
  evaluate(features: FeatureVector): number {
    const analysis = this.analyzeBoard(features);
    const adaptiveWeights = this.adjustWeights(analysis);

    let value = this.bias;
    for (const [name, featureValue] of Object.entries(features.values)) {
      const weight = adaptiveWeights[name] ?? 0;
      value += weight * featureValue;
    }

    return value;
  }

  /**
   * Get current base weights (for training)
   */
  getBaseWeights(): Record<string, number> {
    return { ...this.baseWeights };
  }

  /**
   * Set base weights (for training)
   */
  setBaseWeights(weights: Record<string, number>): void {
    this.baseWeights = { ...weights };
    this.setWeights(weights); // Also update parent class weights
  }
}
