/**
 * Template Layer (T-system)
 *
 * Defines tactical templates with specific preconditions, goals, invariants,
 * and weighted feature preferences for guiding piece placement decisions.
 */

import { TetrisGame } from '../core/game';
import { FeatureVector } from './features';

/**
 * Template identifiers
 */
export enum TemplateType {
  EMERGENCY_CLEAR = 'T1',      // Emergency height management
  SETUP_TSPIN = 'T2',          // T-Spin setup building
  BUILD_FOURWIDE = 'T3',       // 4-wide structure building
  PERFECT_CLEAR_SETUP = 'T4',  // Perfect Clear preparation
  COMBO_CHAIN = 'T5',          // Combo maintenance
  STABLE_DOWNSTACK = 'T6'      // Safe board cleaning
}

/**
 * Template preconditions - when to activate this template
 */
export interface TemplatePreconditions {
  minHeight?: number;          // Minimum aggregate height
  maxHeight?: number;          // Maximum aggregate height
  minHoles?: number;           // Minimum hole count
  maxHoles?: number;           // Maximum hole count
  requireBackToBack?: boolean; // Must have B2B active
  requireCombo?: boolean;      // Must have combo active
  minComboCount?: number;      // Minimum combo count
  maxOccupancy?: number;       // Maximum board occupancy
  incomingGarbage?: boolean;   // Has incoming garbage
  opponentHeight?: number;     // Opponent height threshold
}

/**
 * Template goals - what to achieve
 */
export interface TemplateGoals {
  targetLines?: number;        // Lines to clear
  targetHeight?: number;       // Target height to reach
  maintainB2B?: boolean;       // Keep B2B chain
  maintainCombo?: boolean;     // Keep combo alive
  achievePC?: boolean;         // Get Perfect Clear
  minimizeHoles?: boolean;     // Reduce hole count
  maximizeAttack?: boolean;    // Send maximum garbage
}

/**
 * Template invariants - constraints that must be maintained
 */
export interface TemplateInvariants {
  maxHeightLimit?: number;     // Never exceed this height
  maxHoleLimit?: number;       // Never exceed this many holes
  mustClearLines?: boolean;    // Must clear at least 1 line
  preserveB2B?: boolean;       // Don't break B2B chain
  preserveCombo?: boolean;     // Don't break combo
  avoidGameOver?: boolean;     // Prevent death (always true)
}

/**
 * Template feature preferences (0-1 normalized weights)
 */
export interface TemplateFeatureWeights {
  [featureName: string]: number;
}

/**
 * Template configuration
 */
export interface TemplateConfig {
  type: TemplateType;
  name: string;
  description: string;
  preconditions: TemplatePreconditions;
  goals: TemplateGoals;
  invariants: TemplateInvariants;
  featureWeights: TemplateFeatureWeights;
  priority: number;  // Higher priority templates checked first
}

/**
 * T1: Emergency Clear Template
 * Activated when board is dangerously high
 */
const EMERGENCY_CLEAR_TEMPLATE: TemplateConfig = {
  type: TemplateType.EMERGENCY_CLEAR,
  name: 'Emergency Clear',
  description: 'Emergency line clearing when board height is critical',
  preconditions: {
    minHeight: 15  // Board is very high
  },
  goals: {
    targetLines: 4,      // Clear as many lines as possible
    targetHeight: 10,    // Get back to safe height
    minimizeHoles: true
  },
  invariants: {
    maxHeightLimit: 20,  // Don't top out
    avoidGameOver: true
  },
  featureWeights: {
    linesCleared: 5.0,
    tetris: 3.0,
    aggregateHeight: -3.0,
    maxHeight: -5.0,
    holes: -2.0,
    wastedPlacement: -3.0
  },
  priority: 100  // Highest priority
};

/**
 * T2: T-Spin Setup Template
 * Build T-Spin opportunities
 */
const SETUP_TSPIN_TEMPLATE: TemplateConfig = {
  type: TemplateType.SETUP_TSPIN,
  name: 'T-Spin Setup',
  description: 'Build T-Spin setups for high-value attacks',
  preconditions: {
    minHeight: 4,
    maxHeight: 16,
    maxHoles: 3  // Some holes OK for setup
  },
  goals: {
    maintainB2B: true,
    maximizeAttack: true
  },
  invariants: {
    maxHeightLimit: 18,
    maxHoleLimit: 5,
    avoidGameOver: true
  },
  featureWeights: {
    tspin: 4.0,
    tspinMini: 2.0,
    tspinOpportunity: 3.0,
    backToBack: 2.5,
    holes: -0.5,  // Tolerate holes for setup
    reachableHoles: -0.3,
    garbageSent: 3.0
  },
  priority: 70
};

/**
 * T3: Build 4-Wide Template
 * Construct and maintain 4-wide structure
 */
const BUILD_FOURWIDE_TEMPLATE: TemplateConfig = {
  type: TemplateType.BUILD_FOURWIDE,
  name: 'Build 4-Wide',
  description: 'Construct 4-wide column structure for combo chains',
  preconditions: {
    maxHeight: 12,   // Need room to build
    maxHoles: 2      // Clean board needed
  },
  goals: {
    maintainCombo: true,
    maximizeAttack: true
  },
  invariants: {
    maxHeightLimit: 18,
    preserveCombo: true,
    avoidGameOver: true
  },
  featureWeights: {
    combo: 4.0,
    comboActive: 1.0,
    linesCleared: 2.0,
    wells: 0.5,  // Wells are part of 4-wide
    bumpiness: -0.2,
    holes: -1.0,
    wastedPlacement: -5.0,  // Must maintain combo
    garbageSent: 3.0
  },
  priority: 60
};

/**
 * T4: Perfect Clear Setup Template
 * Build towards Perfect Clear
 */
const PERFECT_CLEAR_SETUP_TEMPLATE: TemplateConfig = {
  type: TemplateType.PERFECT_CLEAR_SETUP,
  name: 'Perfect Clear Setup',
  description: 'Build board towards Perfect Clear opportunity',
  preconditions: {
    maxHeight: 6,        // Low board
    maxOccupancy: 0.3,   // Not too many pieces
    maxHoles: 0          // Zero holes
  },
  goals: {
    achievePC: true,
    minimizeHoles: true
  },
  invariants: {
    maxHoleLimit: 0,  // Absolutely no holes
    avoidGameOver: true
  },
  featureWeights: {
    perfectClear: 10.0,
    holes: -10.0,
    bumpiness: -2.0,
    surfaceRoughness: -2.0,
    occupancy: -1.0,
    wastedPlacement: -3.0,
    garbageSent: 5.0  // PC sends massive garbage
  },
  priority: 80
};

/**
 * T5: Combo Chain Template
 * Maintain active combo
 */
const COMBO_CHAIN_TEMPLATE: TemplateConfig = {
  type: TemplateType.COMBO_CHAIN,
  name: 'Combo Chain',
  description: 'Maintain and extend combo chains',
  preconditions: {
    requireCombo: true,
    minComboCount: 1
  },
  goals: {
    maintainCombo: true,
    maximizeAttack: true
  },
  invariants: {
    preserveCombo: true,
    maxHeightLimit: 18,
    avoidGameOver: true
  },
  featureWeights: {
    combo: 3.0,
    comboActive: 2.0,
    linesCleared: 1.5,
    wastedPlacement: -10.0,  // Cannot break combo
    garbageSent: 2.0,
    aggregateHeight: -0.5
  },
  priority: 75
};

/**
 * T6: Stable Downstack Template
 * Safe, conservative play
 */
const STABLE_DOWNSTACK_TEMPLATE: TemplateConfig = {
  type: TemplateType.STABLE_DOWNSTACK,
  name: 'Stable Downstack',
  description: 'Clean board safely with minimal risk',
  preconditions: {
    maxHeight: 18  // Any non-critical state
  },
  goals: {
    targetHeight: 8,
    minimizeHoles: true
  },
  invariants: {
    maxHeightLimit: 19,
    maxHoleLimit: 3,
    avoidGameOver: true
  },
  featureWeights: {
    linesCleared: 1.0,
    aggregateHeight: -1.0,
    maxHeight: -1.0,
    holes: -2.0,
    bumpiness: -1.0,
    surfaceRoughness: -0.8,
    reachableHoles: -1.0,
    buriedHoles: -2.0,
    occupancy: -0.5
  },
  priority: 50  // Default/fallback template
};

/**
 * All available templates, ordered by priority
 */
export const TEMPLATES: TemplateConfig[] = [
  EMERGENCY_CLEAR_TEMPLATE,
  PERFECT_CLEAR_SETUP_TEMPLATE,
  COMBO_CHAIN_TEMPLATE,
  SETUP_TSPIN_TEMPLATE,
  BUILD_FOURWIDE_TEMPLATE,
  STABLE_DOWNSTACK_TEMPLATE
].sort((a, b) => b.priority - a.priority);

/**
 * Get template by type
 */
export function getTemplate(type: TemplateType): TemplateConfig | undefined {
  return TEMPLATES.find(t => t.type === type);
}

/**
 * Check if template preconditions are met
 */
export function checkPreconditions(
  preconditions: TemplatePreconditions,
  game: TetrisGame,
  features: FeatureVector
): boolean {
  const stats = game.getStats();
  const v = features.values;

  // Height checks
  if (preconditions.minHeight !== undefined && (v.aggregate_height ?? 0) < preconditions.minHeight / 20) {
    return false;
  }
  if (preconditions.maxHeight !== undefined && (v.aggregate_height ?? 1) > preconditions.maxHeight / 20) {
    return false;
  }

  // Hole checks
  if (preconditions.minHoles !== undefined && (v.holes ?? 0) < preconditions.minHoles / 200) {
    return false;
  }
  if (preconditions.maxHoles !== undefined && (v.holes ?? 0) > preconditions.maxHoles / 200) {
    return false;
  }

  // Back-to-back check
  if (preconditions.requireBackToBack !== undefined && preconditions.requireBackToBack) {
    if (!stats.backToBack || (v.back_to_back ?? 0) === 0) {
      return false;
    }
  }

  // Combo checks
  if (preconditions.requireCombo !== undefined && preconditions.requireCombo) {
    if (stats.combo === 0 || (v.combo_active ?? 0) === 0) {
      return false;
    }
  }
  if (preconditions.minComboCount !== undefined && stats.combo < preconditions.minComboCount) {
    return false;
  }

  // Occupancy check
  if (preconditions.maxOccupancy !== undefined && (v.occupancy ?? 0) > preconditions.maxOccupancy) {
    return false;
  }

  return true;
}

/**
 * Check if template invariants are violated
 */
export function checkInvariants(
  invariants: TemplateInvariants,
  game: TetrisGame,
  features: FeatureVector
): boolean {
  const stats = game.getStats();
  const v = features.values;

  // Height limit
  if (invariants.maxHeightLimit !== undefined) {
    if ((v.max_height ?? 0) > invariants.maxHeightLimit / 20) {
      return false;
    }
  }

  // Hole limit
  if (invariants.maxHoleLimit !== undefined) {
    if ((v.holes ?? 0) > invariants.maxHoleLimit / 200) {
      return false;
    }
  }

  // Must clear lines
  if (invariants.mustClearLines !== undefined && invariants.mustClearLines) {
    if ((v.lines_cleared ?? 0) === 0) {
      return false;
    }
  }

  // Preserve B2B
  if (invariants.preserveB2B !== undefined && invariants.preserveB2B) {
    if (stats.backToBack && (v.back_to_back ?? 0) === 0) {
      return false;  // Would break B2B
    }
  }

  // Preserve combo
  if (invariants.preserveCombo !== undefined && invariants.preserveCombo) {
    if (stats.combo > 0 && (v.combo ?? 0) === 0) {
      return false;  // Would break combo
    }
  }

  // Game over check (always enforced)
  if ((v.game_over ?? 0) === 1) {
    return false;
  }

  return true;
}

/**
 * Select the best template for current game state
 */
export function selectTemplate(game: TetrisGame, features: FeatureVector): TemplateConfig {
  // Try templates in priority order
  for (const template of TEMPLATES) {
    if (checkPreconditions(template.preconditions, game, features)) {
      return template;
    }
  }

  // Fallback to stable downstack
  return STABLE_DOWNSTACK_TEMPLATE;
}

/**
 * Apply template feature weights to base weights
 */
export function applyTemplateWeights(
  baseWeights: { [key: string]: number },
  templateWeights: TemplateFeatureWeights
): { [key: string]: number } {
  const result = { ...baseWeights };

  for (const [feature, weight] of Object.entries(templateWeights)) {
    if (result[feature] !== undefined) {
      result[feature] = weight;
    }
  }

  return result;
}
