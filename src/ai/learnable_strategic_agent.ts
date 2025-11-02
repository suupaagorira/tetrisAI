/**
 * Learnable Strategic Agent
 *
 * Combines the learning capabilities of PatternInferenceAgent with
 * the strategic decision-making of StrategicAgent. This agent learns
 * both which strategy to use and how to play within each strategy.
 */

import { TetrisGame } from '../core/game.js';
import { PatternInferenceAgent, SimulationOutcome, AgentOptions } from './agent.js';
import { LinearEvaluator } from './evaluator.js';
import { StrategyType, STRATEGIES } from './strategy.js';
import { StrategySelector, StrategySelectorConfig } from './strategy_selector.js';
import {
  StrategyPerformanceTracker,
  EpisodeStrategyTracker,
  StrategyUsageRecord,
} from './strategy_performance.js';
import { computeStrategicFeatures, StrategicContext } from './features_strategic.js';
import { VersusContext } from './features_extended.js';
import { FeatureVector } from './features.js';

/**
 * Configuration for learnable strategic agent
 */
export interface LearnableStrategicAgentConfig {
  /** Action-level exploration rate (for move selection within a strategy) */
  actionExplorationRate: number;

  /** Strategy-level exploration rate (for strategy selection) */
  strategyExplorationRate: number;

  /** Learning rate for strategy evaluators */
  actionLearningRate: number;

  /** Learning rate for strategy selector */
  strategyLearningRate: number;

  /** Discount factor for strategy-level learning */
  gamma: number;

  /** Enable hold piece usage */
  enableHold: boolean;

  /** Whether to use versus-mode features */
  versusMode: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_LEARNABLE_CONFIG: LearnableStrategicAgentConfig = {
  actionExplorationRate: 0.1,
  strategyExplorationRate: 0.3,
  actionLearningRate: 0.001,
  strategyLearningRate: 0.01,
  gamma: 0.95,
  enableHold: true,
  versusMode: false,
};

/**
 * Strategic decision record for learning
 */
export interface StrategicDecision {
  /** State features when decision was made */
  state: FeatureVector;

  /** Selected strategy */
  strategy: StrategyType;

  /** Selected action within strategy */
  action: SimulationOutcome;

  /** Q-value of selected strategy */
  strategyQValue: number;

  /** Was strategy selected via exploration? */
  strategyExploration: boolean;

  /** Reward received for this decision (to be filled in later) */
  reward?: number;
}

/**
 * Learnable strategic agent that combines strategy selection with action learning
 */
export class LearnableStrategicAgent {
  // Strategy selection
  private strategySelector: StrategySelector;
  private currentStrategy: StrategyType;
  private strategyStartTime: number;
  private strategySwitchCount: number;
  private lastStrategySuccess: boolean;

  // Action selection (one evaluator per strategy)
  private strategyEvaluators: Map<StrategyType, LinearEvaluator>;
  private strategyAgents: Map<StrategyType, PatternInferenceAgent>;

  // Performance tracking
  private performanceTracker: StrategyPerformanceTracker;
  private episodeTracker: EpisodeStrategyTracker | null;

  // Configuration
  private config: LearnableStrategicAgentConfig;

  // Versus context (if in versus mode)
  private versusContext?: VersusContext;

  // Decision history (for learning)
  private decisionHistory: StrategicDecision[];

  constructor(config: Partial<LearnableStrategicAgentConfig> = {}) {
    this.config = { ...DEFAULT_LEARNABLE_CONFIG, ...config };

    // Initialize strategy selector
    const selectorConfig: Partial<StrategySelectorConfig> = {
      epsilon: this.config.strategyExplorationRate,
      learningRate: this.config.strategyLearningRate,
      gamma: this.config.gamma,
    };
    this.strategySelector = new StrategySelector(selectorConfig);

    // Initialize evaluators for each strategy
    this.strategyEvaluators = new Map();
    this.strategyAgents = new Map();

    for (const strategyType of Object.values(StrategyType)) {
      // Get strategy-specific weights
      const strategyConfig = STRATEGIES.get(strategyType);
      const weights = strategyConfig?.weights ?? {};

      // Create evaluator with strategy weights as initial values
      const evaluator = new LinearEvaluator({
        weights,
        learningRate: this.config.actionLearningRate,
      });

      this.strategyEvaluators.set(strategyType, evaluator);

      // Create agent for this strategy
      const agentOptions: AgentOptions = {
        explorationRate: this.config.actionExplorationRate,
        enableHold: this.config.enableHold,
      };
      const agent = new PatternInferenceAgent(evaluator, agentOptions);
      this.strategyAgents.set(strategyType, agent);
    }

    // Initialize strategy state
    this.currentStrategy = StrategyType.B2B_PRESSURE; // Default starting strategy
    this.strategyStartTime = Date.now();
    this.strategySwitchCount = 0;
    this.lastStrategySuccess = false;

    // Initialize tracking
    this.performanceTracker = new StrategyPerformanceTracker();
    this.episodeTracker = null;

    this.decisionHistory = [];
  }

  /**
   * Set versus context for opponent-aware features
   */
  setVersusContext(context: VersusContext): void {
    this.versusContext = context;
  }

  /**
   * Clear versus context (e.g., when switching to solo mode)
   */
  clearVersusContext(): void {
    delete this.versusContext;
  }

  /**
   * Get current strategy
   */
  getCurrentStrategy(): StrategyType {
    return this.currentStrategy;
  }

  /**
   * Start a new episode
   */
  startEpisode(): void {
    this.episodeTracker = new EpisodeStrategyTracker(this.currentStrategy);
    this.strategySwitchCount = 0;
    this.decisionHistory = [];
    this.strategyStartTime = Date.now();
    this.performanceTracker.recordStrategyStart(this.currentStrategy);
  }

  /**
   * End the current episode
   */
  endEpisode(
    finalMoves: number,
    finalScore: number,
    finalGarbage: number,
    won?: boolean
  ): StrategyUsageRecord[] {
    if (!this.episodeTracker) {
      return [];
    }

    const history = this.episodeTracker.finalize(finalMoves, finalScore, finalGarbage);

    // Update performance tracker with episode results
    for (const record of history) {
      const result: {
        score: number;
        garbageSent: number;
        moves: number;
        reward: number;
        won?: boolean;
      } = {
        score: record.scoreGain,
        garbageSent: record.garbageSent,
        moves: record.movesCount,
        reward: record.reward,
      };
      if (won !== undefined) {
        result.won = won;
      }
      this.performanceTracker.recordStrategyEnd(record.strategy, result);
    }

    // End strategy selector episode
    this.strategySelector.endEpisode();

    this.episodeTracker = null;
    return history;
  }

  /**
   * Make a strategic decision and act
   */
  decide(game: TetrisGame): StrategicDecision | null {
    const stats = game.getStats();

    // Compute strategic features
    const strategicContext: StrategicContext = {
      currentStrategy: this.currentStrategy,
      strategyDuration: Date.now() - this.strategyStartTime,
      strategySwitchCount: this.strategySwitchCount,
      lastStrategySuccess: this.lastStrategySuccess,
      ...(this.versusContext ? { versusContext: this.versusContext } : {}),
    };

    const state = computeStrategicFeatures(
      game,
      0, // dropDistance will be filled in by action simulation
      false, // not game over
      strategicContext
    );

    // Select strategy using Q-learning
    const strategySelection = this.strategySelector.selectStrategy(state);

    // Check if we need to switch strategies
    if (strategySelection.strategy !== this.currentStrategy) {
      this.switchStrategy(
        strategySelection.strategy,
        stats.totalPieces,
        stats.score,
        0 // TODO: track cumulative garbage sent
      );
    }

    // Get agent for current strategy
    const agent = this.strategyAgents.get(this.currentStrategy);
    if (!agent) {
      return null;
    }

    // Make decision using strategy-specific agent
    const action = agent.decide(game);
    if (!action) {
      return null;
    }

    // Create decision record
    const decision: StrategicDecision = {
      state,
      strategy: this.currentStrategy,
      action,
      strategyQValue: strategySelection.qValue,
      strategyExploration: strategySelection.wasExploration,
    };

    // Record decision for learning
    this.decisionHistory.push(decision);

    return decision;
  }

  /**
   * Execute a decision
   */
  act(game: TetrisGame): StrategicDecision | null {
    const decision = this.decide(game);
    if (!decision) {
      return null;
    }

    // Apply action to game
    game.copyFrom(decision.action.game);

    return decision;
  }

  /**
   * Switch to a new strategy
   */
  private switchStrategy(
    newStrategy: StrategyType,
    currentMoves: number,
    currentScore: number,
    currentGarbage: number
  ): void {
    if (this.episodeTracker) {
      this.episodeTracker.switchStrategy(newStrategy, currentMoves, currentScore, currentGarbage);
    }

    this.currentStrategy = newStrategy;
    this.strategyStartTime = Date.now();
    this.strategySwitchCount++;

    this.performanceTracker.recordStrategyStart(newStrategy);
  }

  /**
   * Record a reward (for reinforcement learning)
   */
  recordReward(reward: number): void {
    if (this.episodeTracker) {
      this.episodeTracker.addReward(reward);
    }
  }

  /**
   * Update action-level evaluator (strategy-specific weights)
   */
  updateActionEvaluator(
    strategy: StrategyType,
    features: FeatureVector,
    target: number
  ): void {
    const evaluator = this.strategyEvaluators.get(strategy);
    if (evaluator) {
      evaluator.train(features, target);
    }
  }

  /**
   * Update strategy-level Q-function
   */
  updateStrategySelector(
    state: FeatureVector,
    strategy: StrategyType,
    reward: number,
    nextState: FeatureVector,
    isTerminal: boolean = false
  ): void {
    this.strategySelector.updateQValue(state, strategy, reward, nextState, isTerminal);
  }

  /**
   * Get decision history
   */
  getDecisionHistory(): readonly StrategicDecision[] {
    return this.decisionHistory;
  }

  /**
   * Clear decision history
   */
  clearDecisionHistory(): void {
    this.decisionHistory = [];
  }

  /**
   * Get cumulative reward from episode tracker
   */
  getEpisodeReward(): number {
    if (!this.episodeTracker) {
      return 0;
    }
    return this.episodeTracker.getTotalReward();
  }

  /**
   * Get performance tracker
   */
  getPerformanceTracker(): StrategyPerformanceTracker {
    return this.performanceTracker;
  }

  /**
   * Get strategy selector
   */
  getStrategySelector(): StrategySelector {
    return this.strategySelector;
  }

  /**
   * Get evaluator for a specific strategy
   */
  getEvaluatorForStrategy(strategy: StrategyType): LinearEvaluator | undefined {
    return this.strategyEvaluators.get(strategy);
  }

  /**
   * Set exploration rates
   */
  setExplorationRates(actionRate: number, strategyRate: number): void {
    this.config.actionExplorationRate = actionRate;
    this.config.strategyExplorationRate = strategyRate;

    // Update all agents
    for (const agent of this.strategyAgents.values()) {
      // Note: AgentOptions doesn't have a setter, so we'd need to modify agent.ts
      // For now, this is a placeholder
    }
  }

  /**
   * Decay exploration rates
   */
  decayExploration(decayFactor: number = 0.995): void {
    this.config.actionExplorationRate = Math.max(
      0.01,
      this.config.actionExplorationRate * decayFactor
    );

    this.strategySelector.decayEpsilon();
  }

  /**
   * Get configuration
   */
  getConfig(): LearnableStrategicAgentConfig {
    return { ...this.config };
  }

  /**
   * Serialize to JSON
   */
  toJSON(): {
    config: LearnableStrategicAgentConfig;
    strategySelector: ReturnType<StrategySelector['toJSON']>;
    strategyEvaluators: Record<string, { weights: Record<string, number>; bias: number }>;
    performanceTracker: Record<string, unknown>;
  } {
    const evaluatorsData: Record<string, { weights: Record<string, number>; bias: number }> = {};

    for (const [strategy, evaluator] of this.strategyEvaluators) {
      evaluatorsData[strategy] = {
        weights: evaluator.getWeights(),
        bias: evaluator.getBias(),
      };
    }

    return {
      config: this.config,
      strategySelector: this.strategySelector.toJSON(),
      strategyEvaluators: evaluatorsData,
      performanceTracker: this.performanceTracker.toJSON(),
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(data: {
    config: LearnableStrategicAgentConfig;
    strategySelector: Parameters<StrategySelector['fromJSON']>[0];
    strategyEvaluators: Record<string, { weights: Record<string, number>; bias: number }>;
    performanceTracker: Record<string, unknown>;
  }): void {
    this.config = data.config;
    this.strategySelector.fromJSON(data.strategySelector);

    for (const [strategyStr, evalData] of Object.entries(data.strategyEvaluators)) {
      const strategy = strategyStr as StrategyType;
      const evaluator = this.strategyEvaluators.get(strategy);

      if (evaluator) {
        evaluator.setWeights(evalData.weights);
        evaluator.setBias(evalData.bias);
      }
    }

    this.performanceTracker.fromJSON(
      data.performanceTracker as Record<string, import('./strategy_performance.js').StrategyPerformance>
    );
  }
}
