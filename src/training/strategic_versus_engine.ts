/**
 * Strategic Versus Training Engine
 *
 * Advanced training system that combines:
 * - LearnableStrategicAgent
 * - Curriculum learning
 * - Strategic reward computation
 * - Meta-level strategy learning
 */

import { LearnableStrategicAgent } from '../ai/learnable_strategic_agent.js';
import { VersusEnvironment, VersusStepResult } from '../versus/environment.js';
import { StrategyType } from '../ai/strategy.js';
import {
  CurriculumProgress,
  CurriculumStage,
  createOpponentConfig,
  DEFAULT_CURRICULUM,
} from './curriculum.js';
import {
  computeStrategicReward,
  computeTerminalReward,
  createSnapshot,
  GameStateSnapshot,
  EpisodeHistory,
} from './strategic_reward.js';
import { VersusContext } from '../ai/features_extended.js';
import { StrategicDecision } from '../ai/learnable_strategic_agent.js';
import { collectVisibleRows, analyzeColumns } from '../ai/features.js';

/**
 * Training options
 */
export interface StrategicVersusTrainingOptions {
  /** Total episodes to run */
  totalEpisodes: number;

  /** Maximum steps per episode */
  maxStepsPerEpisode: number;

  /** Use curriculum learning */
  useCurriculum: boolean;

  /** Random seed base */
  seedBase?: number;

  /** Action-level learning rate */
  actionLearningRate: number;

  /** Strategy-level learning rate */
  strategyLearningRate: number;

  /** Discount factor */
  gamma: number;

  /** Initial action exploration rate */
  initialActionExploration: number;

  /** Initial strategy exploration rate */
  initialStrategyExploration: number;

  /** Save interval (episodes) */
  saveInterval: number;

  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default options
 */
export const DEFAULT_STRATEGIC_TRAINING_OPTIONS: StrategicVersusTrainingOptions = {
  totalEpisodes: 1000,
  maxStepsPerEpisode: 2000,
  useCurriculum: true,
  seedBase: 1000,
  actionLearningRate: 0.001,
  strategyLearningRate: 0.01,
  gamma: 0.95,
  initialActionExploration: 0.1,
  initialStrategyExploration: 0.3,
  saveInterval: 100,
  verbose: true,
};

/**
 * Episode summary
 */
export interface StrategicEpisodeSummary {
  episodeNumber: number;
  winner: 0 | 1 | null;
  p1Score: number;
  p2Score: number;
  p1GarbageSent: number;
  p2GarbageSent: number;
  p1Moves: number;
  p2Moves: number;
  p1StrategiesUsed: StrategyType[];
  p2StrategiesUsed: StrategyType[];
  p1StrategySwitches: number;
  p2StrategySwitches: number;
  curriculumStage?: string;
}

/**
 * Training results
 */
export interface StrategicTrainingResult {
  episodes: StrategicEpisodeSummary[];
  learningAgent: LearnableStrategicAgent;
  curriculumProgress?: CurriculumProgress;
  winCounts: { p1: number; p2: number; ties: number };
  finalStats: {
    p1WinRate: number;
    p2WinRate: number;
    avgP1Score: number;
    avgP2Score: number;
    avgEpisodeLength: number;
  };
}

/**
 * Run strategic versus training
 */
export function runStrategicVersusTraining(
  options: Partial<StrategicVersusTrainingOptions> = {}
): StrategicTrainingResult {
  const opts = { ...DEFAULT_STRATEGIC_TRAINING_OPTIONS, ...options };

  // Initialize learning agent (Player 1)
  const learningAgent = new LearnableStrategicAgent({
    actionExplorationRate: opts.initialActionExploration,
    strategyExplorationRate: opts.initialStrategyExploration,
    actionLearningRate: opts.actionLearningRate,
    strategyLearningRate: opts.strategyLearningRate,
    gamma: opts.gamma,
    versusMode: true,
  });

  // Initialize curriculum if enabled
  const curriculumProgress = opts.useCurriculum
    ? new CurriculumProgress(DEFAULT_CURRICULUM)
    : undefined;

  // Training state
  const episodes: StrategicEpisodeSummary[] = [];
  let p1Wins = 0;
  let p2Wins = 0;
  let ties = 0;

  // Training loop
  for (let episode = 0; episode < opts.totalEpisodes; episode++) {
    // Get current curriculum stage
    const stage = curriculumProgress?.getCurrentStage();

    // Create opponent
    const opponentAgent = createOpponent(stage, opts);

    // Run match
    const summary = runStrategicMatch(
      learningAgent,
      opponentAgent,
      episode,
      opts,
      stage
    );

    episodes.push(summary);

    // Update win counts
    if (summary.winner === 0) {
      p1Wins++;
    } else if (summary.winner === 1) {
      p2Wins++;
    } else {
      ties++;
    }

    // Update curriculum
    if (curriculumProgress && summary.winner !== null) {
      const advancement = curriculumProgress.recordEpisode(summary.winner === 0);

      if (advancement.advanced && opts.verbose) {
        console.log(
          `[Episode ${episode}] Advanced from ${advancement.previousStage?.name} to ${advancement.newStage?.name}`
        );
      }
    }

    // Decay exploration
    if (episode % 10 === 0) {
      learningAgent.decayExploration();
    }

    // Periodic logging
    if (opts.verbose && (episode + 1) % 50 === 0) {
      const recentWins = episodes.slice(-50).filter((e) => e.winner === 0).length;
      const recentWinRate = recentWins / 50;

      console.log(
        `[Episode ${episode + 1}/${opts.totalEpisodes}] ` +
          `Recent win rate: ${(recentWinRate * 100).toFixed(1)}% | ` +
          `Stage: ${stage?.name ?? 'N/A'} | ` +
          `ε_action: ${learningAgent.getConfig().actionExplorationRate.toFixed(3)} | ` +
          `ε_strategy: ${learningAgent.getStrategySelector().getEpsilon().toFixed(3)}`
      );
    }
  }

  // Compute final statistics
  const totalScoreP1 = episodes.reduce((sum, e) => sum + e.p1Score, 0);
  const totalScoreP2 = episodes.reduce((sum, e) => sum + e.p2Score, 0);
  const totalMoves = episodes.reduce((sum, e) => sum + e.p1Moves, 0);

  const result: StrategicTrainingResult = {
    episodes,
    learningAgent,
    ...(curriculumProgress ? { curriculumProgress } : {}),
    winCounts: { p1: p1Wins, p2: p2Wins, ties },
    finalStats: {
      p1WinRate: p1Wins / opts.totalEpisodes,
      p2WinRate: p2Wins / opts.totalEpisodes,
      avgP1Score: totalScoreP1 / opts.totalEpisodes,
      avgP2Score: totalScoreP2 / opts.totalEpisodes,
      avgEpisodeLength: totalMoves / opts.totalEpisodes,
    },
  };

  return result;
}

/**
 * Create an opponent agent based on curriculum stage
 */
function createOpponent(
  stage: CurriculumStage | undefined,
  opts: StrategicVersusTrainingOptions
): LearnableStrategicAgent {
  if (!stage) {
    // Default opponent if no curriculum
    return new LearnableStrategicAgent({
      actionExplorationRate: 0.1,
      strategyExplorationRate: 0.1,
      versusMode: true,
    });
  }

  const opponentConfig = createOpponentConfig(stage);

  return new LearnableStrategicAgent({
    actionExplorationRate: opponentConfig.explorationRate,
    strategyExplorationRate: opponentConfig.strategySwitchRate,
    actionLearningRate: 0, // Opponent doesn't learn
    strategyLearningRate: 0,
    versusMode: true,
  });
}

/**
 * Run a single strategic match
 */
function runStrategicMatch(
  agentP1: LearnableStrategicAgent,
  agentP2: LearnableStrategicAgent,
  episodeIndex: number,
  options: StrategicVersusTrainingOptions,
  stage?: CurriculumStage
): StrategicEpisodeSummary {
  const seedBase = options.seedBase ?? 1000;
  const seed = seedBase + episodeIndex * 7919;
  const garbageSeed = seedBase + episodeIndex * 3571;

  const environment = new VersusEnvironment({
    seedP1: seed,
    seedP2: seed ^ 0x5f5f5f,
    garbageSeed,
  });

  // Start episodes for both agents
  agentP1.startEpisode();
  agentP2.startEpisode();

  // Decision histories
  const decisionsP1: StrategicDecision[] = [];
  const decisionsP2: StrategicDecision[] = [];

  // State snapshots for reward computation
  const snapshotsP1: GameStateSnapshot[] = [];
  const snapshotsP2: GameStateSnapshot[] = [];

  // Episode histories for diversity
  const historyP1: EpisodeHistory = { strategiesUsed: [], recentStrategies: [] };
  const historyP2: EpisodeHistory = { strategiesUsed: [], recentStrategies: [] };

  // Main loop
  let steps = 0;
  while (!environment.hasEnded() && steps < options.maxStepsPerEpisode) {
    // Alternate turns
    for (const playerIndex of [0, 1] as const) {
      const agent = playerIndex === 0 ? agentP1 : agentP2;
      const opponentIndex = (playerIndex === 0 ? 1 : 0) as 0 | 1;
      const game = environment.getGame(playerIndex);
      const opponentGame = environment.getGame(opponentIndex);
      const snapshot = environment.getPlayerSnapshot(playerIndex);
      const opponentSnapshot = environment.getPlayerSnapshot(opponentIndex);

      // Get state before action
      const statsBefore = game.getStats();
      const board = game.getBoard();
      const visibleRows = collectVisibleRows(board);
      const metrics = analyzeColumns(visibleRows);
      const maxHeight = metrics.heights.length > 0 ? Math.max(...metrics.heights) : 0;

      const snapshotBefore = createSnapshot(
        statsBefore,
        maxHeight,
        metrics.holes,
        0, // occupancy - would need to calculate
        snapshot.totalGarbageSent,
        0, // garbageCancelled - would need to track
        snapshot.totalGarbageReceived
      );

      // Set versus context
      const opponentBoard = opponentGame.getBoard();
      const opponentVisibleRows = collectVisibleRows(opponentBoard);
      const opponentMetrics = analyzeColumns(opponentVisibleRows);
      const opponentMaxHeight = opponentMetrics.heights.length > 0
        ? Math.max(...opponentMetrics.heights)
        : 0;

      const versusContext: VersusContext = {
        opponentHeight: opponentMaxHeight / 20,
        opponentHoles: opponentMetrics.holes / (opponentBoard.width * opponentVisibleRows.length || 1),
        incomingGarbage: snapshot.incomingGarbage,
        outgoingGarbage: 0, // Would need to track
        canCancel: snapshot.incomingGarbage > 0,
      };

      agent.setVersusContext(versusContext);

      // Make decision
      const decision = agent.decide(game);

      if (!decision) {
        break; // No valid moves
      }

      // Execute action - the actor function must apply the game state from the decision
      environment.step(playerIndex, (g) => {
        g.copyFrom(decision.action.game);
        return decision.action;
      });

      // Get state after action
      const statsAfter = game.getStats();
      const boardAfter = game.getBoard();
      const visibleRowsAfter = collectVisibleRows(boardAfter);
      const metricsAfter = analyzeColumns(visibleRowsAfter);
      const maxHeightAfter = metricsAfter.heights.length > 0
        ? Math.max(...metricsAfter.heights)
        : 0;
      const envSnapshotAfter = environment.getPlayerSnapshot(playerIndex);

      const snapshotAfter = createSnapshot(
        statsAfter,
        maxHeightAfter,
        metricsAfter.holes,
        0,
        envSnapshotAfter.totalGarbageSent,
        0,
        envSnapshotAfter.totalGarbageReceived
      );

      // Compute reward
      const episodeHistory = playerIndex === 0 ? historyP1 : historyP2;
      const rewardBreakdown = computeStrategicReward(
        decision.strategy,
        snapshotBefore,
        snapshotAfter,
        episodeHistory,
        versusContext
      );

      // Record decision and reward
      agent.recordReward(rewardBreakdown.total);

      // Store reward in decision for later learning updates
      decision.reward = rewardBreakdown.total;

      if (playerIndex === 0) {
        decisionsP1.push(decision);
        snapshotsP1.push(snapshotAfter);
        historyP1.strategiesUsed.push(decision.strategy);
        historyP1.recentStrategies.push(decision.strategy);
        if (historyP1.recentStrategies.length > 10) {
          historyP1.recentStrategies.shift();
        }
      } else {
        decisionsP2.push(decision);
        snapshotsP2.push(snapshotAfter);
        historyP2.strategiesUsed.push(decision.strategy);
        historyP2.recentStrategies.push(decision.strategy);
        if (historyP2.recentStrategies.length > 10) {
          historyP2.recentStrategies.shift();
        }
      }

      if (environment.hasEnded()) {
        break;
      }
    }

    steps++;
  }

  // Get final states
  const gameP1 = environment.getGame(0);
  const gameP2 = environment.getGame(1);
  const finalSnapshotP1 = environment.getPlayerSnapshot(0);
  const finalSnapshotP2 = environment.getPlayerSnapshot(1);
  const winner = environment.winner();

  // Apply terminal rewards
  const finalStatsP1 = createSnapshot(
    gameP1.getStats(),
    0,
    0,
    0,
    finalSnapshotP1.totalGarbageSent,
    0,
    finalSnapshotP1.totalGarbageReceived
  );
  const finalStatsP2 = createSnapshot(
    gameP2.getStats(),
    0,
    0,
    0,
    finalSnapshotP2.totalGarbageSent,
    0,
    finalSnapshotP2.totalGarbageReceived
  );

  const terminalRewardP1 = computeTerminalReward(
    winner === 0 ? true : winner === 1 ? false : undefined,
    finalStatsP1
  );
  const terminalRewardP2 = computeTerminalReward(
    winner === 1 ? true : winner === 0 ? false : undefined,
    finalStatsP2
  );

  agentP1.recordReward(terminalRewardP1);
  agentP2.recordReward(terminalRewardP2);

  // Update learning (Player 1 only learns)
  updateAgentFromEpisode(agentP1, decisionsP1, options.gamma);

  // End episodes
  agentP1.endEpisode(
    finalSnapshotP1.moves,
    gameP1.getStats().score,
    finalSnapshotP1.totalGarbageSent,
    winner === 0
  );
  agentP2.endEpisode(
    finalSnapshotP2.moves,
    gameP2.getStats().score,
    finalSnapshotP2.totalGarbageSent,
    winner === 1
  );

  // Create summary
  const summary: StrategicEpisodeSummary = {
    episodeNumber: episodeIndex,
    winner,
    p1Score: gameP1.getStats().score,
    p2Score: gameP2.getStats().score,
    p1GarbageSent: finalSnapshotP1.totalGarbageSent,
    p2GarbageSent: finalSnapshotP2.totalGarbageSent,
    p1Moves: finalSnapshotP1.moves,
    p2Moves: finalSnapshotP2.moves,
    p1StrategiesUsed: Array.from(new Set(historyP1.strategiesUsed)),
    p2StrategiesUsed: Array.from(new Set(historyP2.strategiesUsed)),
    p1StrategySwitches: historyP1.strategiesUsed.length - 1,
    p2StrategySwitches: historyP2.strategiesUsed.length - 1,
    ...(stage?.name ? { curriculumStage: stage.name } : {}),
  };

  return summary;
}

/**
 * Update agent from episode using Monte Carlo returns
 */
function updateAgentFromEpisode(
  agent: LearnableStrategicAgent,
  decisions: StrategicDecision[],
  gamma: number
): void {
  if (decisions.length === 0) return;

  // Compute returns for each decision (backwards)
  const returns: number[] = new Array(decisions.length).fill(0);
  let G = 0;

  for (let t = decisions.length - 1; t >= 0; t--) {
    const decision = decisions[t]!;
    const reward = decision.reward ?? 0;

    // G = reward_t + gamma * G
    G = reward + gamma * G;
    returns[t] = G;
  }

  // Update action-level evaluators (strategy-specific)
  for (let t = 0; t < decisions.length; t++) {
    const decision = decisions[t]!;
    const returnValue = returns[t]!;

    agent.updateActionEvaluator(
      decision.strategy,
      decision.action.features,
      returnValue
    );
  }

  // Update strategy-level Q-functions
  // Group decisions by strategy to aggregate rewards per strategy use
  let strategyStartIndex = 0;
  for (let t = 0; t < decisions.length; t++) {
    const current = decisions[t]!;
    const isLastDecision = t === decisions.length - 1;
    const strategyChanged = !isLastDecision && decisions[t + 1]!.strategy !== current.strategy;

    // When strategy changes or episode ends, update Q-value for the strategy
    if (strategyChanged || isLastDecision) {
      // Aggregate rewards from all decisions using this strategy
      let strategyReward = 0;
      for (let i = strategyStartIndex; i <= t; i++) {
        strategyReward += decisions[i]!.reward ?? 0;
      }

      // Get next state (either next decision's state or terminal state)
      const nextState = isLastDecision ? current.state : decisions[t + 1]!.state;
      const isTerminal = isLastDecision;

      agent.updateStrategySelector(
        current.state,
        current.strategy,
        strategyReward,
        nextState,
        isTerminal
      );

      // Move to next strategy segment
      strategyStartIndex = t + 1;
    }
  }
}
