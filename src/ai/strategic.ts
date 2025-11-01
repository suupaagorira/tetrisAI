/**
 * Strategic AI System Index
 *
 * Exports all components of the strategic Tetris AI system.
 */

// Strategy Layer (S-system)
export {
  StrategyType,
  StrategyWeights,
  StrategyConfig,
  StrategyContext,
  STRATEGIES,
  getStrategy,
  createStrategyContext,
  canSwitchStrategy,
  switchStrategy,
  updateStrategyContext
} from './strategy';

// Template Layer (T-system)
export {
  TemplateType,
  TemplatePreconditions,
  TemplateGoals,
  TemplateInvariants,
  TemplateFeatureWeights,
  TemplateConfig,
  TEMPLATES,
  getTemplate,
  checkPreconditions,
  checkInvariants,
  selectTemplate,
  applyTemplateWeights
} from './template';

// Feature Extraction (F-system)
export {
  ExtendedFeatureVector,
  VersusContext,
  computeExtendedFeatures,
  calculateGarbageSent,
  getFeatureValue,
  createFeatureVector
} from './features_extended';

// Switch Triggers (G-system)
export {
  TriggerType,
  TriggerResult,
  TriggerState,
  TriggerConfig,
  HysteresisThresholds,
  evaluateTriggers,
  createTriggerState,
  calculateKillProbability,
  applyHysteresis
} from './triggers';

// Beam Search
export {
  BeamCandidate,
  BeamSearchConfig,
  BeamSearchResult,
  DEFAULT_BEAM_CONFIG,
  beamSearch,
  optimizedBeamSearch,
  adaptiveBeamSearch
} from './beam_search';

// Telemetry
export {
  DecisionTelemetry,
  StrategySwitchTelemetry,
  PerformanceTelemetry,
  SessionSummary,
  TelemetryLogger,
  createRationale
} from './telemetry';

// Strategic Agent
export {
  StrategicAgent,
  StrategicAgentConfig,
  createVersusAgent,
  createSoloAgent
} from './strategic_agent';
