/**
 * Switch Triggers (G-system)
 *
 * Decision criteria for switching between strategies based on game state.
 * Implements 7 trigger types with hysteresis to prevent oscillation.
 */

import { TetrisGame } from '../core/game';
import { StrategyType } from './strategy';
import { ExtendedFeatureVector, VersusContext } from './features_extended';

/**
 * Trigger types
 */
export enum TriggerType {
  KILL_WINDOW = 'G1',          // Opponent vulnerable to attack
  SAFETY_MARGIN = 'G2',        // Board height critical
  B2B_STATUS = 'G3',           // Back-to-back chain status
  RESOURCE_DEPLETION = 'G4',   // Piece availability issues
  OPPONENT_CANCEL = 'G5',      // Opponent cancellation strength
  DWELL_TIME = 'G6',           // Time in current strategy
  GARBAGE_PREDICTION = 'G7'    // Predicted incoming garbage
}

/**
 * Trigger result with recommended strategy
 */
export interface TriggerResult {
  triggered: boolean;
  type: TriggerType;
  recommendedStrategy: StrategyType;
  priority: number;
  reason: string;
  confidence: number;  // 0-1
}

/**
 * Hysteresis thresholds to prevent oscillation
 */
export interface HysteresisThresholds {
  activationThreshold: number;
  deactivationThreshold: number;
}

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  type: TriggerType;
  enabled: boolean;
  priority: number;
  hysteresis: HysteresisThresholds;
}

/**
 * Default trigger configurations
 */
const DEFAULT_TRIGGER_CONFIGS: Record<TriggerType, TriggerConfig> = {
  [TriggerType.KILL_WINDOW]: {
    type: TriggerType.KILL_WINDOW,
    enabled: true,
    priority: 100,
    hysteresis: { activationThreshold: 0.7, deactivationThreshold: 0.5 }
  },
  [TriggerType.SAFETY_MARGIN]: {
    type: TriggerType.SAFETY_MARGIN,
    enabled: true,
    priority: 95,
    hysteresis: { activationThreshold: 0.75, deactivationThreshold: 0.6 }
  },
  [TriggerType.B2B_STATUS]: {
    type: TriggerType.B2B_STATUS,
    enabled: true,
    priority: 70,
    hysteresis: { activationThreshold: 1.0, deactivationThreshold: 0.0 }
  },
  [TriggerType.RESOURCE_DEPLETION]: {
    type: TriggerType.RESOURCE_DEPLETION,
    enabled: true,
    priority: 60,
    hysteresis: { activationThreshold: 0.3, deactivationThreshold: 0.5 }
  },
  [TriggerType.OPPONENT_CANCEL]: {
    type: TriggerType.OPPONENT_CANCEL,
    enabled: true,
    priority: 80,
    hysteresis: { activationThreshold: 0.6, deactivationThreshold: 0.4 }
  },
  [TriggerType.DWELL_TIME]: {
    type: TriggerType.DWELL_TIME,
    enabled: true,
    priority: 50,
    hysteresis: { activationThreshold: 10000, deactivationThreshold: 5000 }  // milliseconds
  },
  [TriggerType.GARBAGE_PREDICTION]: {
    type: TriggerType.GARBAGE_PREDICTION,
    enabled: true,
    priority: 90,
    hysteresis: { activationThreshold: 6, deactivationThreshold: 3 }  // lines
  }
};

/**
 * Trigger state for hysteresis tracking
 */
export interface TriggerState {
  [key: string]: {
    active: boolean;
    lastValue: number;
  };
}

/**
 * Create initial trigger state
 */
export function createTriggerState(): TriggerState {
  const state: TriggerState = {};
  for (const triggerType of Object.values(TriggerType)) {
    state[triggerType] = { active: false, lastValue: 0 };
  }
  return state;
}

/**
 * Evaluate all triggers and return recommended strategy
 */
export function evaluateTriggers(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  versusContext: VersusContext | undefined,
  currentStrategy: StrategyType,
  dwellTime: number,
  triggerState: TriggerState
): TriggerResult | null {
  const results: TriggerResult[] = [];

  // Evaluate each trigger
  results.push(evaluateKillWindow(game, features, versusContext, triggerState));
  results.push(evaluateSafetyMargin(game, features, triggerState));
  results.push(evaluateB2BStatus(game, features, triggerState));
  results.push(evaluateResourceDepletion(game, features, triggerState));
  results.push(evaluateOpponentCancel(game, features, versusContext, triggerState));
  results.push(evaluateDwellTime(currentStrategy, dwellTime, triggerState));
  results.push(evaluateGarbagePrediction(game, features, versusContext, triggerState));

  // Filter triggered results
  const triggered = results.filter(r => r.triggered);

  // Return highest priority trigger
  if (triggered.length > 0) {
    triggered.sort((a, b) => b.priority - a.priority);
    return triggered[0]!;
  }

  return null;
}

/**
 * G1: Kill Window Trigger
 * Detect when opponent is vulnerable to elimination
 */
function evaluateKillWindow(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  versusContext: VersusContext | undefined,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.KILL_WINDOW];
  const state = triggerState[TriggerType.KILL_WINDOW]!;

  if (!versusContext) {
    return { triggered: false, type: TriggerType.KILL_WINDOW, recommendedStrategy: StrategyType.B2B_PRESSURE, priority: 0, reason: '', confidence: 0 };
  }

  // Calculate kill probability
  const killProb = calculateKillProbability(game, features, versusContext);

  // Apply hysteresis
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = killProb >= threshold;
  state.active = triggered;
  state.lastValue = killProb;

  return {
    triggered,
    type: TriggerType.KILL_WINDOW,
    recommendedStrategy: StrategyType.CHEESE_FARMING,  // Go for the kill
    priority: config.priority,
    reason: `Kill probability: ${(killProb * 100).toFixed(1)}%`,
    confidence: killProb
  };
}

/**
 * Calculate kill probability using sigmoid function
 */
export function calculateKillProbability(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  versusContext: VersusContext
): number {
  // Factors contributing to kill probability
  let score = 0;

  // Opponent height (higher = more vulnerable)
  if (versusContext.opponentHeight !== undefined) {
    score += versusContext.opponentHeight * 3;  // Weight: 3
  }

  // Opponent holes (more holes = more vulnerable)
  if (versusContext.opponentHoles !== undefined) {
    score += versusContext.opponentHoles * 2;  // Weight: 2
  }

  // Our attack potential
  const attackPotential = features.values.attack_potential ?? 0;
  score += attackPotential * 2;  // Weight: 2

  // Our combo/B2B status
  const stats = game.getStats();
  if (stats.backToBack) {
    score += 1;
  }
  if (stats.combo > 0) {
    score += Math.min(stats.combo / 5, 1);
  }

  // Height advantage
  const heightAdvantage = features.values.height_advantage ?? 0;
  if (heightAdvantage > 0) {
    score += heightAdvantage * 2;  // Weight: 2
  }

  // Apply sigmoid function: 1 / (1 + e^(-k*(x-x0)))
  // k=2 for steepness, x0=5 for midpoint
  const k = 2;
  const x0 = 5;
  const probability = 1 / (1 + Math.exp(-k * (score - x0)));

  return probability;
}

/**
 * G2: Safety Margin Trigger
 * Activate defense when board is too high
 */
function evaluateSafetyMargin(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.SAFETY_MARGIN];
  const state = triggerState[TriggerType.SAFETY_MARGIN]!;

  const maxHeight = features.values.max_height ?? 0;

  // Apply hysteresis
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = maxHeight >= threshold;
  state.active = triggered;
  state.lastValue = maxHeight;

  return {
    triggered,
    type: TriggerType.SAFETY_MARGIN,
    recommendedStrategy: StrategyType.DEFENSE_CANCEL,
    priority: config.priority,
    reason: `Max height: ${(maxHeight * 20).toFixed(1)} rows`,
    confidence: maxHeight
  };
}

/**
 * G3: B2B Status Trigger
 * Switch to B2B pressure when B2B is active
 */
function evaluateB2BStatus(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.B2B_STATUS];
  const state = triggerState[TriggerType.B2B_STATUS]!;

  const gameStats = game.getStats();
  const hasB2B = gameStats.backToBack;
  const value = hasB2B ? 1 : 0;

  // B2B trigger activates when B2B is active, deactivates when lost
  const triggered = hasB2B && !state.active;
  state.active = hasB2B;
  state.lastValue = value;

  return {
    triggered,
    type: TriggerType.B2B_STATUS,
    recommendedStrategy: StrategyType.B2B_PRESSURE,
    priority: config.priority,
    reason: hasB2B ? 'B2B chain active' : 'No B2B',
    confidence: value
  };
}

/**
 * G4: Resource Depletion Trigger
 * Detect when critical pieces are unavailable
 */
function evaluateResourceDepletion(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.RESOURCE_DEPLETION];
  const state = triggerState[TriggerType.RESOURCE_DEPLETION]!;

  // Check availability of critical pieces (I for Tetris, T for T-Spin)
  const hasI = features.values.has_i_piece ?? 0;
  const hasT = features.values.has_t_piece ?? 0;
  const diversity = features.values.queue_diversity ?? 1;

  // Resource score: higher = better availability
  const resourceScore = (hasI + hasT + diversity) / 3;

  // Apply hysteresis (inverted: low score triggers)
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = resourceScore <= threshold;
  state.active = triggered;
  state.lastValue = resourceScore;

  return {
    triggered,
    type: TriggerType.RESOURCE_DEPLETION,
    recommendedStrategy: StrategyType.DEFENSE_CANCEL,  // Use defensive strategy
    priority: config.priority,
    reason: `Resource availability: ${(resourceScore * 100).toFixed(0)}%`,
    confidence: 1 - resourceScore
  };
}

/**
 * G5: Opponent Cancellation Trigger
 * Detect strong opponent pressure requiring defense
 */
function evaluateOpponentCancel(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  versusContext: VersusContext | undefined,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.OPPONENT_CANCEL];
  const state = triggerState[TriggerType.OPPONENT_CANCEL]!;

  if (!versusContext) {
    return { triggered: false, type: TriggerType.OPPONENT_CANCEL, recommendedStrategy: StrategyType.DEFENSE_CANCEL, priority: 0, reason: '', confidence: 0 };
  }

  // Calculate opponent pressure
  let pressure = 0;

  if (versusContext.opponentCombo !== undefined && versusContext.opponentCombo > 0) {
    pressure += versusContext.opponentCombo / 10;
  }
  if (versusContext.opponentBackToBack) {
    pressure += 0.3;
  }
  if (versusContext.incomingGarbage !== undefined) {
    pressure += versusContext.incomingGarbage / 20;
  }

  pressure = Math.min(pressure, 1);

  // Apply hysteresis
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = pressure >= threshold;
  state.active = triggered;
  state.lastValue = pressure;

  return {
    triggered,
    type: TriggerType.OPPONENT_CANCEL,
    recommendedStrategy: StrategyType.DEFENSE_CANCEL,
    priority: config.priority,
    reason: `Opponent pressure: ${(pressure * 100).toFixed(0)}%`,
    confidence: pressure
  };
}

/**
 * G6: Dwell Time Trigger
 * Force strategy evaluation after prolonged time in one strategy
 */
function evaluateDwellTime(
  currentStrategy: StrategyType,
  dwellTime: number,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.DWELL_TIME];
  const state = triggerState[TriggerType.DWELL_TIME]!;

  // Apply hysteresis
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = dwellTime >= threshold;
  state.active = triggered;
  state.lastValue = dwellTime;

  // Rotate to next strategy based on current
  let nextStrategy = StrategyType.B2B_PRESSURE;
  switch (currentStrategy) {
    case StrategyType.B2B_PRESSURE:
      nextStrategy = StrategyType.CHEESE_FARMING;
      break;
    case StrategyType.CHEESE_FARMING:
      nextStrategy = StrategyType.FOURWIDE_DOMINANCE;
      break;
    case StrategyType.FOURWIDE_DOMINANCE:
      nextStrategy = StrategyType.B2B_PRESSURE;
      break;
    default:
      nextStrategy = StrategyType.B2B_PRESSURE;
  }

  return {
    triggered,
    type: TriggerType.DWELL_TIME,
    recommendedStrategy: nextStrategy,
    priority: config.priority,
    reason: `Dwell time: ${(dwellTime / 1000).toFixed(1)}s`,
    confidence: Math.min(dwellTime / 20000, 1)  // Max confidence at 20s
  };
}

/**
 * G7: Garbage Prediction Trigger
 * Predict and respond to incoming garbage
 */
function evaluateGarbagePrediction(
  game: TetrisGame,
  features: ExtendedFeatureVector,
  versusContext: VersusContext | undefined,
  triggerState: TriggerState
): TriggerResult {
  const config = DEFAULT_TRIGGER_CONFIGS[TriggerType.GARBAGE_PREDICTION];
  const state = triggerState[TriggerType.GARBAGE_PREDICTION]!;

  if (!versusContext) {
    return { triggered: false, type: TriggerType.GARBAGE_PREDICTION, recommendedStrategy: StrategyType.DEFENSE_CANCEL, priority: 0, reason: '', confidence: 0 };
  }

  const incomingGarbage = versusContext.incomingGarbage ?? 0;

  // Apply hysteresis
  const threshold = state.active
    ? config.hysteresis.deactivationThreshold
    : config.hysteresis.activationThreshold;

  const triggered = incomingGarbage >= threshold;
  state.active = triggered;
  state.lastValue = incomingGarbage;

  return {
    triggered,
    type: TriggerType.GARBAGE_PREDICTION,
    recommendedStrategy: StrategyType.DEFENSE_CANCEL,
    priority: config.priority,
    reason: `Incoming garbage: ${incomingGarbage} lines`,
    confidence: Math.min(incomingGarbage / 10, 1)
  };
}

/**
 * Apply hysteresis to prevent oscillation
 */
export function applyHysteresis(
  currentValue: number,
  previousValue: number,
  wasActive: boolean,
  thresholds: HysteresisThresholds
): boolean {
  if (wasActive) {
    // Was active: need to drop below deactivation threshold
    return currentValue >= thresholds.deactivationThreshold;
  } else {
    // Was inactive: need to exceed activation threshold
    return currentValue >= thresholds.activationThreshold;
  }
}
