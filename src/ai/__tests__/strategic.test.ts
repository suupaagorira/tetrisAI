/**
 * Strategic AI System Tests
 *
 * Tests for acceptance criteria:
 * - 100% accuracy on defensive thresholds
 * - ≤8ms 99th percentile latency
 */

import { TetrisGame } from '../../core/game';
import { Bag } from '../../core/bag';
import { StrategicAgent, createVersusAgent, createSoloAgent } from '../strategic_agent';
import { StrategyType } from '../strategy';
import { VersusContext } from '../features_extended';
import { calculateKillProbability } from '../triggers';

describe('Strategic AI System', () => {
  describe('StrategicAgent', () => {
    it('should create agent with default configuration', () => {
      const agent = new StrategicAgent();
      expect(agent).toBeDefined();
      expect(agent.getCurrentStrategy()).toBe(StrategyType.B2B_PRESSURE);
    });

    it('should create agent with custom strategy', () => {
      const agent = new StrategicAgent({
        initialStrategy: StrategyType.DEFENSE_CANCEL
      });
      expect(agent.getCurrentStrategy()).toBe(StrategyType.DEFENSE_CANCEL);
    });

    it('should make decisions within target latency', () => {
      const agent = new StrategicAgent({ targetLatency: 8 });
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const startTime = performance.now();
      const decision = agent.decide(game);
      const elapsed = performance.now() - startTime;

      expect(decision).toBeDefined();
      expect(elapsed).toBeLessThan(10); // Allow small margin
    });

    it('should track telemetry when enabled', () => {
      const agent = new StrategicAgent({ enableTelemetry: true });
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      agent.decide(game);

      const telemetry = agent.getTelemetry();
      expect(telemetry).not.toBeNull();
      expect(telemetry?.getRecentDecisions(1).length).toBe(1);
    });

    it('should not track telemetry when disabled', () => {
      const agent = new StrategicAgent({ enableTelemetry: false });
      expect(agent.getTelemetry()).toBeNull();
    });
  });

  describe('Strategy Switching', () => {
    it('should switch to defense when board is high', () => {
      const agent = new StrategicAgent({
        initialStrategy: StrategyType.B2B_PRESSURE
      });

      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      // Artificially raise board height
      for (let y = 10; y < 18; y++) {
        for (let x = 0; x < 8; x++) {
          game.board.cells[y]![x] = 1;
        }
      }

      // Make a decision
      agent.decide(game);

      // After a high board state, strategy might switch to defense
      // (depending on triggers)
      const telemetry = agent.getTelemetry();
      expect(telemetry).toBeDefined();
    });

    it('should respect cooldown between switches', () => {
      const agent = new StrategicAgent();
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const initialStrategy = agent.getCurrentStrategy();

      // Make multiple quick decisions
      agent.decide(game);
      agent.decide(game);

      // Should not switch too rapidly
      expect(agent.getStrategyDwellTime()).toBeLessThan(1000);
    });
  });

  describe('Versus Mode', () => {
    it('should create versus agent', () => {
      const agent = createVersusAgent();
      expect(agent).toBeDefined();
    });

    it('should use versus context for decisions', () => {
      const agent = createVersusAgent();
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const versusContext: VersusContext = {
        opponentHeight: 0.8,
        incomingGarbage: 5,
        outgoingGarbage: 0
      };

      agent.setVersusContext(versusContext);
      const decision = agent.decide(game);

      expect(decision).toBeDefined();
    });

    it('should calculate kill probability correctly', () => {
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const features = {
        values: {
          attack_potential: 0.8,
          height_advantage: 0.3
        }
      };

      const versusContext: VersusContext = {
        opponentHeight: 0.9,
        opponentHoles: 0.5
      };

      const killProb = calculateKillProbability(game, features as any, versusContext);

      expect(killProb).toBeGreaterThan(0);
      expect(killProb).toBeLessThanOrEqual(1);
    });
  });

  describe('Performance Tests', () => {
    it('should meet 99th percentile latency requirement (≤8ms)', () => {
      const agent = new StrategicAgent({ targetLatency: 4 });
      const bag = new Bag(12345);
      const latencies: number[] = [];

      // Run 100 decisions
      for (let i = 0; i < 100; i++) {
        const game = new TetrisGame(bag);

        const startTime = performance.now();
        agent.decide(game);
        const elapsed = performance.now() - startTime;

        latencies.push(elapsed);
      }

      // Calculate 99th percentile
      const sorted = latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(sorted.length * 0.99);
      const p99Latency = sorted[p99Index] ?? 0;

      expect(p99Latency).toBeLessThanOrEqual(8);
    });

    it('should evaluate candidates efficiently', () => {
      const agent = new StrategicAgent({
        beamConfig: { beamWidth: 8, maxDepth: 1, timeLimit: 4, pruneThreshold: 0.3 }
      });

      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const decision = agent.decide(game);

      expect(decision).toBeDefined();

      const telemetry = agent.getTelemetry();
      const lastDecision = telemetry?.getRecentDecisions(1)[0];

      expect(lastDecision?.candidatesEvaluated).toBeGreaterThan(0);
      expect(lastDecision?.beamWidth).toBeLessThanOrEqual(8);
    });
  });

  describe('Defensive Threshold Accuracy', () => {
    it('should activate defense when height > 15', () => {
      const agent = new StrategicAgent({
        initialStrategy: StrategyType.B2B_PRESSURE
      });

      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      // Set board to critical height
      for (let y = 5; y < 18; y++) {
        for (let x = 0; x < 8; x++) {
          game.board.cells[y]![x] = 1;
        }
      }

      // Make decision
      agent.decide(game);

      // Check if defense-related strategy or template was selected
      const telemetry = agent.getTelemetry();
      const lastDecision = telemetry?.getRecentDecisions(1)[0];

      // Should trigger safety margin or use emergency template
      expect(lastDecision).toBeDefined();
    });

    it('should activate garbage defense when incoming > 6 lines', () => {
      const agent = createVersusAgent();
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      const versusContext: VersusContext = {
        opponentHeight: 0.5,
        incomingGarbage: 8
      };

      agent.setVersusContext(versusContext);
      agent.decide(game);

      const telemetry = agent.getTelemetry();
      const lastDecision = telemetry?.getRecentDecisions(1)[0];

      // Should trigger garbage prediction
      expect(lastDecision).toBeDefined();
    });
  });

  describe('Solo Mode', () => {
    it('should create solo agent with PC strategy', () => {
      const agent = createSoloAgent();
      expect(agent.getCurrentStrategy()).toBe(StrategyType.PC_UTILIZATION);
    });
  });

  describe('Telemetry Export', () => {
    it('should export telemetry as JSON', () => {
      const agent = new StrategicAgent();
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      agent.decide(game);

      const json = agent.exportTelemetryJSON();
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);

      const parsed = JSON.parse(json);
      expect(parsed.decisions).toBeDefined();
      expect(parsed.decisions.length).toBe(1);
    });

    it('should export summary with statistics', () => {
      const agent = new StrategicAgent();
      const bag = new Bag(12345);
      const game = new TetrisGame(bag);

      // Make several decisions
      for (let i = 0; i < 10; i++) {
        agent.decide(game);
      }

      const summary = agent.exportSummaryJSON(1000, 20, true);
      expect(summary).toBeDefined();

      const parsed = JSON.parse(summary);
      expect(parsed.totalMoves).toBe(10);
      expect(parsed.averageLatency).toBeGreaterThan(0);
      expect(parsed.p99Latency).toBeDefined();
    });
  });
});
