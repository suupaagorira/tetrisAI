/**
 * Strategy Selector with Q-Learning
 *
 * Implements meta-level learning for strategy selection using Q-learning.
 * Learns which strategy to use in different game states to maximize long-term reward.
 */

import { StrategyType } from './strategy.js';
import { FeatureVector } from './features.js';
import { LinearEvaluator } from './evaluator.js';

/**
 * Configuration for strategy selector
 */
export interface StrategySelectorConfig {
  /** Exploration rate (epsilon in epsilon-greedy) */
  epsilon: number;

  /** Learning rate for Q-value updates */
  learningRate: number;

  /** Discount factor for future rewards */
  gamma: number;

  /** Minimum epsilon value (for decay) */
  minEpsilon: number;

  /** Epsilon decay rate per episode */
  epsilonDecay: number;
}

/**
 * Default configuration
 */
export const DEFAULT_SELECTOR_CONFIG: StrategySelectorConfig = {
  epsilon: 0.3,
  learningRate: 0.01,
  gamma: 0.95,
  minEpsilon: 0.05,
  epsilonDecay: 0.995,
};

/**
 * Q-value estimation history for a single update
 */
export interface QUpdateRecord {
  state: FeatureVector;
  strategy: StrategyType;
  reward: number;
  nextState: FeatureVector;
  qValueBefore: number;
  qValueAfter: number;
  tdError: number;
}

/**
 * Strategy selector using Q-learning
 */
export class StrategySelector {
  private qFunctions: Map<StrategyType, LinearEvaluator>;
  private config: StrategySelectorConfig;
  private updateHistory: QUpdateRecord[];
  private episodeCount: number;

  constructor(config: Partial<StrategySelectorConfig> = {}) {
    this.config = { ...DEFAULT_SELECTOR_CONFIG, ...config };
    this.qFunctions = new Map();
    this.updateHistory = [];
    this.episodeCount = 0;

    // Initialize Q-function (linear evaluator) for each strategy
    for (const strategyType of Object.values(StrategyType)) {
      this.qFunctions.set(
        strategyType,
        new LinearEvaluator({
          learningRate: this.config.learningRate,
          // Initialize with small random weights to break symmetry
          weights: this.initializeRandomWeights(),
        })
      );
    }
  }

  /**
   * Select a strategy using epsilon-greedy policy
   */
  selectStrategy(state: FeatureVector, forceGreedy: boolean = false): {
    strategy: StrategyType;
    qValue: number;
    wasExploration: boolean;
  } {
    const epsilon = forceGreedy ? 0 : this.config.epsilon;

    // Exploration: random strategy
    if (Math.random() < epsilon) {
      const strategies = Object.values(StrategyType);
      const randomStrategy = strategies[Math.floor(Math.random() * strategies.length)]!;
      const qValue = this.getQValue(state, randomStrategy);

      return {
        strategy: randomStrategy,
        qValue,
        wasExploration: true,
      };
    }

    // Exploitation: best strategy
    const { strategy, qValue } = this.getBestStrategy(state);

    return {
      strategy,
      qValue,
      wasExploration: false,
    };
  }

  /**
   * Get the best strategy for a given state
   */
  getBestStrategy(state: FeatureVector): {
    strategy: StrategyType;
    qValue: number;
  } {
    let bestStrategy = StrategyType.B2B_PRESSURE;
    let bestQValue = -Infinity;

    for (const strategyType of Object.values(StrategyType)) {
      const qValue = this.getQValue(state, strategyType);
      if (qValue > bestQValue) {
        bestQValue = qValue;
        bestStrategy = strategyType;
      }
    }

    return { strategy: bestStrategy, qValue: bestQValue };
  }

  /**
   * Get Q-value for a specific state-strategy pair
   */
  getQValue(state: FeatureVector, strategy: StrategyType): number {
    const qFunction = this.qFunctions.get(strategy);
    if (!qFunction) {
      throw new Error(`No Q-function for strategy: ${strategy}`);
    }
    return qFunction.evaluate(state);
  }

  /**
   * Get all Q-values for a given state
   */
  getAllQValues(state: FeatureVector): Map<StrategyType, number> {
    const qValues = new Map<StrategyType, number>();
    for (const strategyType of Object.values(StrategyType)) {
      qValues.set(strategyType, this.getQValue(state, strategyType));
    }
    return qValues;
  }

  /**
   * Update Q-value using Q-learning update rule
   *
   * Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
   */
  updateQValue(
    state: FeatureVector,
    strategy: StrategyType,
    reward: number,
    nextState: FeatureVector,
    isTerminal: boolean = false
  ): QUpdateRecord {
    const qFunction = this.qFunctions.get(strategy)!;

    // Current Q-value
    const currentQ = qFunction.evaluate(state);

    // Max Q-value for next state (0 if terminal)
    const maxNextQ = isTerminal ? 0 : this.getMaxQValue(nextState);

    // TD target: r + γ max_a' Q(s',a')
    const target = reward + this.config.gamma * maxNextQ;

    // TD error
    const tdError = target - currentQ;

    // Update the Q-function (uses gradient descent internally)
    qFunction.train(state, target);

    // Record update for analysis
    const updateRecord: QUpdateRecord = {
      state,
      strategy,
      reward,
      nextState,
      qValueBefore: currentQ,
      qValueAfter: qFunction.evaluate(state),
      tdError,
    };

    this.updateHistory.push(updateRecord);

    return updateRecord;
  }

  /**
   * Get maximum Q-value across all strategies for a given state
   */
  private getMaxQValue(state: FeatureVector): number {
    let maxQ = -Infinity;
    for (const strategyType of Object.values(StrategyType)) {
      const qValue = this.getQValue(state, strategyType);
      if (qValue > maxQ) {
        maxQ = qValue;
      }
    }
    return maxQ;
  }

  /**
   * Decay epsilon (reduce exploration over time)
   */
  decayEpsilon(): void {
    this.config.epsilon = Math.max(
      this.config.minEpsilon,
      this.config.epsilon * this.config.epsilonDecay
    );
  }

  /**
   * Called at the end of each episode
   */
  endEpisode(): void {
    this.episodeCount++;
    this.decayEpsilon();
  }

  /**
   * Get current epsilon value
   */
  getEpsilon(): number {
    return this.config.epsilon;
  }

  /**
   * Get episode count
   */
  getEpisodeCount(): number {
    return this.episodeCount;
  }

  /**
   * Get update history (for analysis and debugging)
   */
  getUpdateHistory(): readonly QUpdateRecord[] {
    return this.updateHistory;
  }

  /**
   * Clear update history
   */
  clearUpdateHistory(): void {
    this.updateHistory = [];
  }

  /**
   * Get the Q-function weights for a strategy (for inspection/debugging)
   */
  getStrategyWeights(strategy: StrategyType): Record<string, number> {
    const qFunction = this.qFunctions.get(strategy);
    if (!qFunction) {
      throw new Error(`No Q-function for strategy: ${strategy}`);
    }
    return { ...qFunction.getWeights() };
  }

  /**
   * Serialize to JSON for saving
   */
  toJSON(): {
    config: StrategySelectorConfig;
    episodeCount: number;
    qFunctions: Record<string, { weights: Record<string, number>; bias: number }>;
  } {
    const qFunctionsData: Record<string, { weights: Record<string, number>; bias: number }> = {};

    for (const [strategy, qFunction] of this.qFunctions) {
      qFunctionsData[strategy] = {
        weights: qFunction.getWeights(),
        bias: qFunction.getBias(),
      };
    }

    return {
      config: this.config,
      episodeCount: this.episodeCount,
      qFunctions: qFunctionsData,
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data: {
    config: StrategySelectorConfig;
    episodeCount: number;
    qFunctions: Record<string, { weights: Record<string, number>; bias: number }>;
  }): void {
    this.config = data.config;
    this.episodeCount = data.episodeCount;

    for (const [strategyStr, qData] of Object.entries(data.qFunctions)) {
      const strategy = strategyStr as StrategyType;
      const qFunction = this.qFunctions.get(strategy);

      if (qFunction) {
        // Load weights and bias
        qFunction.setWeights(qData.weights);
        qFunction.setBias(qData.bias);
      }
    }
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.episodeCount = 0;
    this.config.epsilon = DEFAULT_SELECTOR_CONFIG.epsilon;
    this.updateHistory = [];

    // Reinitialize Q-functions
    for (const strategyType of Object.values(StrategyType)) {
      this.qFunctions.set(
        strategyType,
        new LinearEvaluator({
          learningRate: this.config.learningRate,
          weights: this.initializeRandomWeights(),
        })
      );
    }
  }

  /**
   * Initialize random weights for breaking symmetry
   */
  private initializeRandomWeights(): Record<string, number> {
    // Small random initialization around 0
    // This helps break symmetry between strategies at the start
    const baseFeatures = [
      'bias',
      'lines_cleared',
      'tetris',
      'tspin',
      'back_to_back',
      'combo',
      'aggregate_height',
      'max_height',
      'holes',
      'bumpiness',
      'wells',
      'occupancy',
      'perfect_clear',
      'tspin_availability',
      'combo_potential',
      'pc_feasibility',
      'relative_advantage',
      'opponent_vulnerability',
      'tempo_control',
      'strategic_pressure',
    ];

    const weights: Record<string, number> = {};
    for (const feature of baseFeatures) {
      // Small random values between -0.1 and 0.1
      weights[feature] = (Math.random() - 0.5) * 0.2;
    }

    return weights;
  }

  /**
   * Get statistics about Q-value distribution
   */
  getQValueStats(state: FeatureVector): {
    mean: number;
    min: number;
    max: number;
    std: number;
    byStrategy: Map<StrategyType, number>;
  } {
    const qValues = this.getAllQValues(state);
    const values = Array.from(qValues.values());

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    return {
      mean,
      min,
      max,
      std,
      byStrategy: qValues,
    };
  }
}
