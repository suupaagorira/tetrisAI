/**
 * Telemetry System
 *
 * JSON-based logging of decision rationales and performance metrics.
 * Provides transparency into strategic AI decision-making.
 */

import { StrategyType } from './strategy';
import { TemplateType } from './template';
import { TriggerType } from './triggers';
import { ExtendedFeatureVector } from './features_extended';

/**
 * Decision telemetry entry
 */
export interface DecisionTelemetry {
  timestamp: number;
  moveNumber: number;

  // Strategy info
  strategy: StrategyType;
  strategyName: string;
  strategyDwellTime: number;  // ms

  // Template info
  template: TemplateType;
  templateName: string;

  // Trigger info
  triggeredBy?: TriggerType;
  triggerReason?: string;
  triggerConfidence?: number;

  // Decision info
  evaluation: number;
  candidatesEvaluated: number;
  beamWidth: number;

  // Performance
  decisionLatency: number;  // ms

  // Game state
  gameState: {
    height: number;
    holes: number;
    score: number;
    lines: number;
    combo: number;
    backToBack: boolean;
  };

  // Versus state (if applicable)
  versusState?: {
    opponentHeight?: number;
    incomingGarbage?: number;
    outgoingGarbage?: number;
    killProbability?: number;
    heightAdvantage?: number;
  };

  // Feature snapshot (optional, can be large)
  features?: Record<string, number>;

  // Rationale
  rationale: string;
}

/**
 * Strategy switch telemetry
 */
export interface StrategySwitchTelemetry {
  timestamp: number;
  moveNumber: number;
  fromStrategy: StrategyType;
  toStrategy: StrategyType;
  trigger: TriggerType;
  triggerReason: string;
  triggerConfidence: number;
  dwellTime: number;  // Time spent in previous strategy (ms)
}

/**
 * Performance telemetry
 */
export interface PerformanceTelemetry {
  timestamp: number;
  moveNumber: number;
  decisionLatency: number;
  candidatesEvaluated: number;
  beamWidth: number;
  featureExtractionTime?: number;
  evaluationTime?: number;
  searchTime?: number;
}

/**
 * Session summary telemetry
 */
export interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  totalMoves: number;

  // Performance stats
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;

  // Strategy usage
  strategyUsage: Record<StrategyType, {
    count: number;
    totalDwellTime: number;
    averageDwellTime: number;
  }>;

  // Trigger stats
  triggerCounts: Record<TriggerType, number>;

  // Game outcome
  finalScore: number;
  finalLines: number;
  won?: boolean;

  // Latency violations
  violationsAbove4ms: number;
  violationsAbove8ms: number;
}

/**
 * Telemetry logger
 */
export class TelemetryLogger {
  private decisions: DecisionTelemetry[] = [];
  private switches: StrategySwitchTelemetry[] = [];
  private performance: PerformanceTelemetry[] = [];

  private sessionId: string;
  private startTime: number;
  private moveCounter: number = 0;

  private latencies: number[] = [];
  private strategyStats: Map<StrategyType, { count: number; totalTime: number }> = new Map();
  private triggerCounts: Map<TriggerType, number> = new Map();

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
  }

  /**
   * Log a decision
   */
  logDecision(telemetry: DecisionTelemetry): void {
    telemetry.timestamp = Date.now();
    telemetry.moveNumber = this.moveCounter++;

    this.decisions.push(telemetry);
    this.latencies.push(telemetry.decisionLatency);

    // Update strategy stats
    const stats = this.strategyStats.get(telemetry.strategy) ?? { count: 0, totalTime: 0 };
    stats.count++;
    this.strategyStats.set(telemetry.strategy, stats);
  }

  /**
   * Log a strategy switch
   */
  logStrategySwitch(telemetry: StrategySwitchTelemetry): void {
    telemetry.timestamp = Date.now();
    telemetry.moveNumber = this.moveCounter;

    this.switches.push(telemetry);

    // Update trigger counts
    const count = this.triggerCounts.get(telemetry.trigger) ?? 0;
    this.triggerCounts.set(telemetry.trigger, count + 1);

    // Update strategy dwell time
    const stats = this.strategyStats.get(telemetry.fromStrategy) ?? { count: 0, totalTime: 0 };
    stats.totalTime += telemetry.dwellTime;
    this.strategyStats.set(telemetry.fromStrategy, stats);
  }

  /**
   * Log performance metrics
   */
  logPerformance(telemetry: PerformanceTelemetry): void {
    telemetry.timestamp = Date.now();
    telemetry.moveNumber = this.moveCounter;

    this.performance.push(telemetry);
  }

  /**
   * Generate session summary
   */
  generateSummary(finalScore: number, finalLines: number, won?: boolean): SessionSummary {
    const endTime = Date.now();

    // Calculate latency percentiles
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    const averageLatency = this.latencies.reduce((sum, l) => sum + l, 0) / (this.latencies.length || 1);
    const p95Latency = sortedLatencies[p95Index] ?? 0;
    const p99Latency = sortedLatencies[p99Index] ?? 0;
    const maxLatency = Math.max(...this.latencies, 0);

    // Strategy usage
    const strategyUsage: Record<string, any> = {};
    for (const [strategy, stats] of this.strategyStats.entries()) {
      strategyUsage[strategy] = {
        count: stats.count,
        totalDwellTime: stats.totalTime,
        averageDwellTime: stats.count > 0 ? stats.totalTime / stats.count : 0
      };
    }

    // Trigger counts
    const triggerCounts: Record<string, number> = {};
    for (const [trigger, count] of this.triggerCounts.entries()) {
      triggerCounts[trigger] = count;
    }

    // Latency violations
    const violationsAbove4ms = this.latencies.filter(l => l > 4).length;
    const violationsAbove8ms = this.latencies.filter(l => l > 8).length;

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime,
      totalMoves: this.moveCounter,
      averageLatency,
      p95Latency,
      p99Latency,
      maxLatency,
      strategyUsage: strategyUsage as any,
      triggerCounts: triggerCounts as any,
      finalScore,
      finalLines,
      won,
      violationsAbove4ms,
      violationsAbove8ms
    };
  }

  /**
   * Export all telemetry as JSON
   */
  exportJSON(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      decisions: this.decisions,
      switches: this.switches,
      performance: this.performance
    }, null, 2);
  }

  /**
   * Export summary as JSON
   */
  exportSummaryJSON(finalScore: number, finalLines: number, won?: boolean): string {
    const summary = this.generateSummary(finalScore, finalLines, won);
    return JSON.stringify(summary, null, 2);
  }

  /**
   * Get last N decisions
   */
  getRecentDecisions(count: number = 10): DecisionTelemetry[] {
    return this.decisions.slice(-count);
  }

  /**
   * Get all strategy switches
   */
  getStrategySwitches(): StrategySwitchTelemetry[] {
    return [...this.switches];
  }

  /**
   * Get performance violations (latency > threshold)
   */
  getLatencyViolations(threshold: number = 8): PerformanceTelemetry[] {
    return this.performance.filter(p => p.decisionLatency > threshold);
  }

  /**
   * Clear all telemetry
   */
  clear(): void {
    this.decisions = [];
    this.switches = [];
    this.performance = [];
    this.latencies = [];
    this.strategyStats.clear();
    this.triggerCounts.clear();
    this.moveCounter = 0;
    this.startTime = Date.now();
  }

  /**
   * Save telemetry to file (for Node.js environments)
   */
  async saveToFile(filepath: string): Promise<void> {
    if (typeof window !== 'undefined') {
      console.warn('saveToFile is only available in Node.js environments');
      return;
    }

    const fs = await import('fs/promises');
    await fs.writeFile(filepath, this.exportJSON(), 'utf-8');
  }

  /**
   * Save summary to file
   */
  async saveSummaryToFile(filepath: string, finalScore: number, finalLines: number, won?: boolean): Promise<void> {
    if (typeof window !== 'undefined') {
      console.warn('saveSummaryToFile is only available in Node.js environments');
      return;
    }

    const fs = await import('fs/promises');
    await fs.writeFile(filepath, this.exportSummaryJSON(finalScore, finalLines, won), 'utf-8');
  }
}

/**
 * Create decision rationale text
 */
export function createRationale(
  strategy: string,
  template: string,
  trigger?: string,
  gameState?: { height: number; holes: number; combo: number }
): string {
  let rationale = `Strategy: ${strategy}, Template: ${template}`;

  if (trigger) {
    rationale += `, Trigger: ${trigger}`;
  }

  if (gameState) {
    rationale += ` | H:${gameState.height.toFixed(1)} Holes:${gameState.holes.toFixed(0)}`;
    if (gameState.combo > 0) {
      rationale += ` Combo:${gameState.combo}`;
    }
  }

  return rationale;
}
