/**
 * Strategic Agent
 *
 * Integrates all strategic systems (S, T, F, G) for competitive Tetris AI.
 * Implements strategy selection, template-based evaluation, and adaptive switching.
 */

import { TetrisGame } from '../core/game';
import { Piece } from '../core/pieces';
import {
  StrategyType,
  StrategyConfig,
  StrategyContext,
  getStrategy,
  createStrategyContext,
  canSwitchStrategy,
  switchStrategy as performStrategySwitch,
  updateStrategyContext
} from './strategy';
import {
  TemplateType,
  TemplateConfig,
  selectTemplate,
  checkInvariants,
  applyTemplateWeights
} from './template';
import {
  computeExtendedFeatures,
  ExtendedFeatureVector,
  VersusContext
} from './features_extended';
import {
  evaluateTriggers,
  TriggerState,
  TriggerResult,
  createTriggerState
} from './triggers';
import {
  beamSearch,
  optimizedBeamSearch,
  BeamSearchConfig,
  DEFAULT_BEAM_CONFIG,
  BeamCandidate
} from './beam_search';
import {
  TelemetryLogger,
  DecisionTelemetry,
  StrategySwitchTelemetry,
  createRationale
} from './telemetry';
import { computeFeatures, FeatureVector } from './features';

/**
 * Strategic Agent configuration
 */
export interface StrategicAgentConfig {
  initialStrategy?: StrategyType;
  enableTelemetry?: boolean;
  targetLatency?: number;  // Target decision latency in ms
  beamConfig?: BeamSearchConfig;
  versusMode?: boolean;
}

/**
 * Strategic Agent for competitive Tetris
 */
export class StrategicAgent {
  private strategyContext: StrategyContext;
  private triggerState: TriggerState;
  private telemetry: TelemetryLogger | null;
  private config: StrategicAgentConfig;
  private versusContext?: VersusContext;

  constructor(config: StrategicAgentConfig = {}) {
    this.config = {
      initialStrategy: config.initialStrategy ?? StrategyType.B2B_PRESSURE,
      enableTelemetry: config.enableTelemetry ?? true,
      targetLatency: config.targetLatency ?? 4,
      beamConfig: config.beamConfig ?? DEFAULT_BEAM_CONFIG,
      versusMode: config.versusMode ?? false
    };

    this.strategyContext = createStrategyContext(this.config.initialStrategy);
    this.triggerState = createTriggerState();
    this.telemetry = this.config.enableTelemetry ? new TelemetryLogger() : null;
  }

  /**
   * Set versus context for competitive play
   */
  setVersusContext(context: VersusContext): void {
    this.versusContext = context;
  }

  /**
   * Clear versus context
   */
  clearVersusContext(): void {
    this.versusContext = undefined;
  }

  /**
   * Decide on the best move
   */
  decide(game: TetrisGame): BeamCandidate {
    const decisionStartTime = performance.now();

    // Update strategy context timing
    this.strategyContext = updateStrategyContext(this.strategyContext);

    // Get current strategy and template
    const currentStrategy = getStrategy(this.strategyContext.currentStrategy);

    // Extract current game features for template selection
    const currentFeatures = this.extractCurrentFeatures(game);

    // Select appropriate template
    const template = selectTemplate(game, currentFeatures);

    // Check for strategy switches
    const trigger = evaluateTriggers(
      game,
      currentFeatures,
      this.versusContext,
      this.strategyContext.currentStrategy,
      this.strategyContext.dwellTime,
      this.triggerState
    );

    // Handle strategy switch
    if (trigger && trigger.triggered && trigger.recommendedStrategy !== this.strategyContext.currentStrategy) {
      if (canSwitchStrategy(this.strategyContext)) {
        const previousStrategy = this.strategyContext.currentStrategy;
        const previousStrategyConfig = getStrategy(previousStrategy);

        // Log strategy switch
        if (this.telemetry) {
          const switchTelemetry: StrategySwitchTelemetry = {
            timestamp: Date.now(),
            moveNumber: 0,
            fromStrategy: previousStrategy,
            toStrategy: trigger.recommendedStrategy,
            trigger: trigger.type,
            triggerReason: trigger.reason,
            triggerConfidence: trigger.confidence,
            dwellTime: this.strategyContext.dwellTime
          };
          this.telemetry.logStrategySwitch(switchTelemetry);
        }

        // Perform switch
        this.strategyContext = performStrategySwitch(
          this.strategyContext,
          trigger.recommendedStrategy
        );

        // Update current strategy
        const newStrategy = getStrategy(this.strategyContext.currentStrategy);
        this.performDecision(game, newStrategy, template, decisionStartTime, trigger);
      }
    }

    return this.performDecision(game, currentStrategy, template, decisionStartTime, trigger);
  }

  /**
   * Perform the actual decision with current strategy and template
   */
  private performDecision(
    game: TetrisGame,
    strategy: StrategyConfig,
    template: TemplateConfig,
    startTime: number,
    trigger: TriggerResult | null
  ): BeamCandidate {
    // Configure beam search based on strategy
    const beamConfig: BeamSearchConfig = {
      ...this.config.beamConfig!,
      beamWidth: strategy.beamWidth,
      timeLimit: this.config.targetLatency!
    };

    // Create evaluation function with current strategy and template weights
    const evaluateFn = this.createEvaluationFunction(strategy, template);

    // Perform beam search
    const searchResult = optimizedBeamSearch(game, evaluateFn, beamConfig);

    const decisionLatency = performance.now() - startTime;

    // Log decision telemetry
    if (this.telemetry) {
      const maxHeight = searchResult.bestCandidate.features?.values.max_height ?? 0;
      const holes = searchResult.bestCandidate.features?.values.holes ?? 0;

      const telemetry: DecisionTelemetry = {
        timestamp: Date.now(),
        moveNumber: 0,
        strategy: strategy.type,
        strategyName: strategy.name,
        strategyDwellTime: this.strategyContext.dwellTime,
        template: template.type,
        templateName: template.name,
        triggeredBy: trigger?.type,
        triggerReason: trigger?.reason,
        triggerConfidence: trigger?.confidence,
        evaluation: searchResult.bestCandidate.evaluation,
        candidatesEvaluated: searchResult.candidatesEvaluated,
        beamWidth: searchResult.beamWidth,
        decisionLatency,
        gameState: {
          height: maxHeight * 20,
          holes: holes * 200,
          score: game.score,
          lines: game.lines,
          combo: game.combo,
          backToBack: game.backToBack
        },
        versusState: this.versusContext ? {
          opponentHeight: this.versusContext.opponentHeight,
          incomingGarbage: this.versusContext.incomingGarbage,
          outgoingGarbage: this.versusContext.outgoingGarbage,
          killProbability: searchResult.bestCandidate.features?.values.kill_probability,
          heightAdvantage: searchResult.bestCandidate.features?.values.height_advantage
        } : undefined,
        features: searchResult.bestCandidate.features?.values,
        rationale: createRationale(
          strategy.name,
          template.name,
          trigger?.reason,
          {
            height: maxHeight * 20,
            holes: holes * 200,
            combo: game.combo
          }
        )
      };

      this.telemetry.logDecision(telemetry);
      this.telemetry.logPerformance({
        timestamp: Date.now(),
        moveNumber: 0,
        decisionLatency,
        candidatesEvaluated: searchResult.candidatesEvaluated,
        beamWidth: searchResult.beamWidth
      });
    }

    return searchResult.bestCandidate;
  }

  /**
   * Create evaluation function combining strategy and template
   */
  private createEvaluationFunction(
    strategy: StrategyConfig,
    template: TemplateConfig
  ): (game: TetrisGame, dropDistance: number) => { evaluation: number; features: FeatureVector } {
    return (game: TetrisGame, dropDistance: number) => {
      // Extract features
      const features = computeExtendedFeatures(
        game,
        dropDistance,
        game.isGameOver(),
        this.versusContext
      );

      // Check template invariants
      const invariantsSatisfied = checkInvariants(template.invariants, game, features);
      if (!invariantsSatisfied) {
        // Heavily penalize moves that violate invariants
        return { evaluation: -10000, features };
      }

      // Combine strategy weights and template weights
      const combinedWeights = this.combineWeights(strategy, template);

      // Calculate evaluation as weighted sum of features
      let evaluation = 0;
      for (const [feature, value] of Object.entries(features.values)) {
        const weight = combinedWeights[feature] ?? 0;
        evaluation += weight * value;
      }

      return { evaluation, features };
    };
  }

  /**
   * Combine strategy weights with template weights
   */
  private combineWeights(
    strategy: StrategyConfig,
    template: TemplateConfig
  ): Record<string, number> {
    const weights: Record<string, number> = {};

    // Map strategy weights to feature names
    weights.lines_cleared = strategy.weights.linesCleared;
    weights.tetris = strategy.weights.tetris;
    weights.tspin = strategy.weights.tspin;
    weights.tspin_mini = strategy.weights.tspinMini;
    weights.back_to_back = strategy.weights.backToBack;
    weights.combo = strategy.weights.combo;
    weights.perfect_clear = strategy.weights.perfectClear;
    weights.score_gain = strategy.weights.scoreGain;
    weights.aggregate_height = strategy.weights.aggregateHeight;
    weights.max_height = strategy.weights.maxHeight;
    weights.holes = strategy.weights.holes;
    weights.bumpiness = strategy.weights.bumpiness;
    weights.wells = strategy.weights.wells;
    weights.occupancy = strategy.weights.occupancy;
    weights.surface_roughness = strategy.weights.surfaceRoughness;
    weights.tspin_opportunity = strategy.weights.tspinOpportunity;
    weights.reachable_holes = strategy.weights.reachableHoles;
    weights.buried_holes = strategy.weights.buriedHoles;
    weights.wasted_placement = strategy.weights.wastedPlacement;
    weights.garbage_sent = strategy.weights.garbageSent;
    weights.garbage_received = strategy.weights.garbageReceived;
    weights.attack_potential = strategy.weights.attackPotential;

    // Override with template weights
    for (const [feature, weight] of Object.entries(template.featureWeights)) {
      weights[feature] = weight;
    }

    return weights;
  }

  /**
   * Extract current game features without simulation
   */
  private extractCurrentFeatures(game: TetrisGame): ExtendedFeatureVector {
    return computeExtendedFeatures(
      game,
      0,
      game.isGameOver(),
      this.versusContext
    );
  }

  /**
   * Apply best move to game
   */
  act(game: TetrisGame): void {
    const bestMove = this.decide(game);

    // Apply hold if needed
    if (bestMove.useHold) {
      game.hold();
    }

    // Set piece to target position
    if (game.activePiece) {
      game.activePiece.rotation = bestMove.rotation;
      game.activePiece.x = bestMove.column;
    }

    // Hard drop
    game.hardDrop();
  }

  /**
   * Get current strategy
   */
  getCurrentStrategy(): StrategyType {
    return this.strategyContext.currentStrategy;
  }

  /**
   * Get strategy dwell time
   */
  getStrategyDwellTime(): number {
    return this.strategyContext.dwellTime;
  }

  /**
   * Get telemetry logger
   */
  getTelemetry(): TelemetryLogger | null {
    return this.telemetry;
  }

  /**
   * Export telemetry as JSON
   */
  exportTelemetryJSON(): string {
    return this.telemetry?.exportJSON() ?? '{}';
  }

  /**
   * Export summary as JSON
   */
  exportSummaryJSON(finalScore: number, finalLines: number, won?: boolean): string {
    return this.telemetry?.exportSummaryJSON(finalScore, finalLines, won) ?? '{}';
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.strategyContext = createStrategyContext(this.config.initialStrategy);
    this.triggerState = createTriggerState();
    this.telemetry?.clear();
  }
}

/**
 * Create strategic agent for versus mode
 */
export function createVersusAgent(config?: Partial<StrategicAgentConfig>): StrategicAgent {
  return new StrategicAgent({
    ...config,
    versusMode: true,
    enableTelemetry: config?.enableTelemetry ?? true,
    initialStrategy: config?.initialStrategy ?? StrategyType.B2B_PRESSURE
  });
}

/**
 * Create strategic agent for solo mode
 */
export function createSoloAgent(config?: Partial<StrategicAgentConfig>): StrategicAgent {
  return new StrategicAgent({
    ...config,
    versusMode: false,
    enableTelemetry: config?.enableTelemetry ?? true,
    initialStrategy: config?.initialStrategy ?? StrategyType.PC_UTILIZATION
  });
}
