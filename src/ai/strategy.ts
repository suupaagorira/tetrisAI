/**
 * Strategy Layer (S-system)
 *
 * Defines high-level competitive Tetris strategies with distinct behavioral patterns.
 * Each strategy represents a different approach to gameplay optimization.
 */

import { TetrisGame } from '../core/game';

/**
 * Strategy identifiers
 */
export enum StrategyType {
  B2B_PRESSURE = 'S1',        // Back-to-back attack pressure
  DEFENSE_CANCEL = 'S2',      // Defensive play with cancellation
  PC_UTILIZATION = 'S3',      // Perfect Clear exploitation
  FOURWIDE_DOMINANCE = 'S4',  // 4-wide attack pattern
  CHEESE_FARMING = 'S5',      // Maximum garbage sending
  TEMPO_DELAY = 'S6'          // Strategic tempo control
}

/**
 * Strategy weight modifiers
 * Each strategy applies different weight multipliers to features
 */
export interface StrategyWeights {
  // Offensive features
  linesCleared: number;
  tetris: number;
  tspin: number;
  tspinMini: number;
  backToBack: number;
  combo: number;
  perfectClear: number;
  scoreGain: number;

  // Defensive features
  aggregateHeight: number;
  maxHeight: number;
  holes: number;
  bumpiness: number;
  wells: number;
  occupancy: number;
  surfaceRoughness: number;

  // Special features
  tspinOpportunity: number;
  reachableHoles: number;
  buriedHoles: number;
  wastedPlacement: number;

  // Versus-specific
  garbageSent: number;
  garbageReceived: number;
  attackPotential: number;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  type: StrategyType;
  name: string;
  description: string;
  weights: StrategyWeights;
  beamWidth: number;  // Constrained beam search width
}

/**
 * Default weight values (baseline)
 */
const DEFAULT_WEIGHTS: StrategyWeights = {
  linesCleared: 1.0,
  tetris: 1.5,
  tspin: 2.0,
  tspinMini: 0.6,
  backToBack: 0.8,
  combo: 0.8,
  perfectClear: 5.0,
  scoreGain: 0.1,
  aggregateHeight: -0.6,
  maxHeight: -0.4,
  holes: -0.9,
  bumpiness: -0.3,
  wells: -0.45,
  occupancy: -0.1,
  surfaceRoughness: -0.25,
  tspinOpportunity: 1.5,
  reachableHoles: -0.5,
  buriedHoles: -1.0,
  wastedPlacement: -0.5,
  garbageSent: 2.0,
  garbageReceived: -1.5,
  attackPotential: 1.2
};

/**
 * S1: B2B Pressure Strategy
 * Focus on maintaining back-to-back chains for sustained pressure
 */
const B2B_PRESSURE_STRATEGY: StrategyConfig = {
  type: StrategyType.B2B_PRESSURE,
  name: 'B2B Pressure',
  description: 'Maintain back-to-back chains with Tetris and T-Spins for sustained attack pressure',
  weights: {
    ...DEFAULT_WEIGHTS,
    backToBack: 2.5,        // Heavily prioritize B2B
    tetris: 2.0,            // Prefer Tetris
    tspin: 2.5,             // Prefer T-Spins
    tspinOpportunity: 2.0,  // Setup T-Spins
    combo: 1.2,             // Maintain combos
    garbageSent: 2.5,       // Maximize attack
    aggregateHeight: -0.4,  // Accept higher board
    holes: -0.7             // Tolerate some holes for setups
  },
  beamWidth: 8
};

/**
 * S2: Defense & Cancellation Strategy
 * Prioritize quick line clears to cancel incoming garbage
 */
const DEFENSE_CANCEL_STRATEGY: StrategyConfig = {
  type: StrategyType.DEFENSE_CANCEL,
  name: 'Defense & Cancel',
  description: 'Prioritize quick line clears and board stability to cancel incoming garbage',
  weights: {
    ...DEFAULT_WEIGHTS,
    linesCleared: 2.0,      // Any line clear is valuable
    aggregateHeight: -1.2,  // Keep board low
    maxHeight: -1.5,        // Critical height control
    holes: -1.5,            // Minimize holes
    bumpiness: -0.8,        // Smooth surface
    surfaceRoughness: -0.7, // Clean board
    garbageReceived: -2.5,  // Heavily penalize received garbage
    wastedPlacement: -1.0,  // Avoid non-clearing moves
    reachableHoles: -0.8    // Fix holes quickly
  },
  beamWidth: 6  // Faster decisions for defense
};

/**
 * S3: Perfect Clear Utilization Strategy
 * Exploit Perfect Clear opportunities for massive damage
 */
const PC_UTILIZATION_STRATEGY: StrategyConfig = {
  type: StrategyType.PC_UTILIZATION,
  name: 'PC Utilization',
  description: 'Build towards and exploit Perfect Clear opportunities for maximum damage',
  weights: {
    ...DEFAULT_WEIGHTS,
    perfectClear: 10.0,     // Massively prioritize PC
    holes: -2.0,            // No holes allowed
    bumpiness: -1.0,        // Clean structure
    surfaceRoughness: -1.2, // Smooth board
    occupancy: -0.3,        // Keep board clean
    aggregateHeight: -0.8,  // Moderate height
    garbageSent: 3.0,       // PC sends massive garbage
    wastedPlacement: -1.5   // Every move must be perfect
  },
  beamWidth: 10  // Wider search for PC setups
};

/**
 * S4: 4-Wide Dominance Strategy
 * Build and maintain 4-wide attack patterns
 */
const FOURWIDE_DOMINANCE_STRATEGY: StrategyConfig = {
  type: StrategyType.FOURWIDE_DOMINANCE,
  name: '4-Wide Dominance',
  description: 'Build and maintain 4-wide column for sustained combo attacks',
  weights: {
    ...DEFAULT_WEIGHTS,
    combo: 3.0,             // Massive combo focus
    linesCleared: 1.5,      // Consistent clears
    garbageSent: 2.8,       // High attack output
    wells: -0.2,            // Wells are needed for 4-wide
    bumpiness: -0.1,        // Some bumpiness acceptable
    aggregateHeight: -0.5,  // Accept higher board
    wastedPlacement: -2.0,  // Must maintain combo
    attackPotential: 2.5    // Maximize attack chains
  },
  beamWidth: 8
};

/**
 * S5: Cheese Farming Strategy
 * Maximize garbage sent through any means
 */
const CHEESE_FARMING_STRATEGY: StrategyConfig = {
  type: StrategyType.CHEESE_FARMING,
  name: 'Cheese Farming',
  description: 'Maximize garbage output through aggressive clearing patterns',
  weights: {
    ...DEFAULT_WEIGHTS,
    garbageSent: 4.0,       // Primary objective
    tetris: 2.5,            // High-value clears
    tspin: 3.0,             // High-value clears
    combo: 2.0,             // Chain attacks
    backToBack: 2.0,        // Multiply damage
    attackPotential: 3.0,   // Setup big attacks
    aggregateHeight: -0.3,  // Very aggressive
    holes: -0.5,            // Tolerate holes
    scoreGain: 0.05         // Don't care about score
  },
  beamWidth: 8
};

/**
 * S6: Tempo Delay Strategy
 * Control game pace and wait for opponent mistakes
 */
const TEMPO_DELAY_STRATEGY: StrategyConfig = {
  type: StrategyType.TEMPO_DELAY,
  name: 'Tempo Delay',
  description: 'Strategic tempo control to wait for opponent mistakes while maintaining safety',
  weights: {
    ...DEFAULT_WEIGHTS,
    aggregateHeight: -1.0,  // Very safe
    maxHeight: -1.2,        // Conservative height
    holes: -1.2,            // Clean board
    bumpiness: -0.6,        // Smooth surface
    surfaceRoughness: -0.5, // Clean structure
    linesCleared: 0.5,      // Less aggressive clearing
    wastedPlacement: -0.2,  // OK to not clear
    occupancy: -0.2,        // Keep board empty
    garbageReceived: -2.0   // Focus on defense
  },
  beamWidth: 6  // Quick, safe decisions
};

/**
 * All available strategies
 */
export const STRATEGIES: Map<StrategyType, StrategyConfig> = new Map([
  [StrategyType.B2B_PRESSURE, B2B_PRESSURE_STRATEGY],
  [StrategyType.DEFENSE_CANCEL, DEFENSE_CANCEL_STRATEGY],
  [StrategyType.PC_UTILIZATION, PC_UTILIZATION_STRATEGY],
  [StrategyType.FOURWIDE_DOMINANCE, FOURWIDE_DOMINANCE_STRATEGY],
  [StrategyType.CHEESE_FARMING, CHEESE_FARMING_STRATEGY],
  [StrategyType.TEMPO_DELAY, TEMPO_DELAY_STRATEGY]
]);

/**
 * Get strategy configuration by type
 */
export function getStrategy(type: StrategyType): StrategyConfig {
  const strategy = STRATEGIES.get(type);
  if (!strategy) {
    throw new Error(`Unknown strategy type: ${type}`);
  }
  return strategy;
}

/**
 * Strategy context for decision making
 */
export interface StrategyContext {
  currentStrategy: StrategyType;
  previousStrategy: StrategyType | null;
  strategyStartTime: number;
  lastSwitchTime: number;
  switchCooldown: number;  // milliseconds
  dwellTime: number;       // Time in current strategy (ms)
}

/**
 * Create initial strategy context
 */
export function createStrategyContext(initialStrategy: StrategyType = StrategyType.B2B_PRESSURE): StrategyContext {
  const now = Date.now();
  return {
    currentStrategy: initialStrategy,
    previousStrategy: null,
    strategyStartTime: now,
    lastSwitchTime: now,
    switchCooldown: 500,  // 500ms cooldown between switches
    dwellTime: 0
  };
}

/**
 * Check if strategy can be switched (respects cooldown)
 */
export function canSwitchStrategy(context: StrategyContext): boolean {
  const now = Date.now();
  const timeSinceLastSwitch = now - context.lastSwitchTime;
  return timeSinceLastSwitch >= context.switchCooldown;
}

/**
 * Switch to a new strategy
 */
export function switchStrategy(context: StrategyContext, newStrategy: StrategyType): StrategyContext {
  if (!canSwitchStrategy(context)) {
    return context;  // Cannot switch yet
  }

  const now = Date.now();
  return {
    ...context,
    currentStrategy: newStrategy,
    previousStrategy: context.currentStrategy,
    strategyStartTime: now,
    lastSwitchTime: now,
    dwellTime: 0
  };
}

/**
 * Update strategy context timing
 */
export function updateStrategyContext(context: StrategyContext): StrategyContext {
  const now = Date.now();
  return {
    ...context,
    dwellTime: now - context.strategyStartTime
  };
}
