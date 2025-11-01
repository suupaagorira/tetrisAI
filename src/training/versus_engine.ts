import { PatternInferenceAgent } from '../ai/agent';
import { LinearEvaluator, AdaptiveEvaluator, EvaluatorConfig } from '../ai/evaluator';
import { VersusEnvironment, VersusStepResult } from '../versus/environment';
import {
  cloneFeatures,
  Experience,
  normaliseConfig,
  serializeBoard,
  updateFromHistory,
} from './common';

export interface VersusTrainingOptions {
  episodes: number;
  maxSteps: number;
  gamma: number;
  learningRateP1: number;
  learningRateP2: number;
  explorationRateP1: number;
  explorationRateP2: number;
  initialWeightsP1?: EvaluatorConfig;
  initialWeightsP2?: EvaluatorConfig;
  seedBase?: number;
}

export interface VersusPlayerEpisodeStats {
  score: number;
  lines: number;
  moves: number;
  garbageSent: number;
  garbageReceived: number;
  board: number[][];
}

export interface VersusEpisodeSummary {
  winner: 0 | 1 | null;
  p1: VersusPlayerEpisodeStats;
  p2: VersusPlayerEpisodeStats;
}

export interface VersusTrainingRunResult {
  summaries: VersusEpisodeSummary[];
  evaluatorConfigP1: EvaluatorConfig;
  evaluatorConfigP2: EvaluatorConfig;
  winCounts: { p1: number; p2: number; ties: number };
  averages: {
    p1: { score: number; lines: number; garbageSent: number; garbageReceived: number };
    p2: { score: number; lines: number; garbageSent: number; garbageReceived: number };
  };
}

const WIN_REWARD = 1000;
const LOSS_REWARD = -1000;

function applyTerminalReward(history: Experience[], reward: number): void {
  if (history.length === 0) {
    return;
  }
  history[history.length - 1]!.reward += reward;
}

function buildEvaluator(
  config: EvaluatorConfig | undefined,
  learningRate: number,
): AdaptiveEvaluator {
  const normalised = normaliseConfig(config, learningRate);
  const evaluator = new AdaptiveEvaluator({
    weights: normalised.weights,
    bias: normalised.bias ?? 0,
    learningRate,
  });
  return evaluator;
}

function runMatch(
  agentP1: PatternInferenceAgent,
  agentP2: PatternInferenceAgent,
  options: VersusTrainingOptions,
  episodeIndex: number,
): {
  summary: VersusEpisodeSummary;
  historyP1: Experience[];
  historyP2: Experience[];
} {
  const seedBase = options.seedBase ?? 1000;
  const seed = seedBase + episodeIndex * 7919;
  const garbageSeed = seedBase + episodeIndex * 3571;
  const environment = new VersusEnvironment({
    seedP1: seed,
    seedP2: seed,
    garbageSeed,
  });

  const histories: [Experience[], Experience[]] = [[], []];

  while (!environment.hasEnded()) {
    const snapshotP1 = environment.getPlayerSnapshot(0);
    const snapshotP2 = environment.getPlayerSnapshot(1);
    if (
      snapshotP1.moves >= options.maxSteps &&
      snapshotP2.moves >= options.maxSteps
    ) {
      break;
    }
    const stepOrder: (0 | 1)[] = [0, 1];
    for (const playerIndex of stepOrder) {
      const currentSnapshot = environment.getPlayerSnapshot(playerIndex);
      if (currentSnapshot.moves >= options.maxSteps) {
        continue;
      }
      const stepResult = takeStep(environment, playerIndex, agentP1, agentP2);
      if (stepResult.outcome) {
        const before = stepResult.statsBefore;
        const after = stepResult.statsAfter;
        const reward = after.score - before.score;
        histories[playerIndex].push({
          features: cloneFeatures(stepResult.outcome.features),
          reward,
        });
      }
      if (environment.hasEnded()) {
        break;
      }
    }
  }

  const winner = environment.winner();
  if (winner === 0) {
    applyTerminalReward(histories[0], WIN_REWARD);
    applyTerminalReward(histories[1], LOSS_REWARD);
  } else if (winner === 1) {
    applyTerminalReward(histories[1], WIN_REWARD);
    applyTerminalReward(histories[0], LOSS_REWARD);
  }

  const gameP1 = environment.getGame(0);
  const gameP2 = environment.getGame(1);
  const snapshotP1 = environment.getPlayerSnapshot(0);
  const snapshotP2 = environment.getPlayerSnapshot(1);

  const summary: VersusEpisodeSummary = {
    winner,
    p1: {
      score: gameP1.getStats().score,
      lines: gameP1.getStats().lines,
      moves: snapshotP1.moves,
      garbageSent: snapshotP1.totalGarbageSent,
      garbageReceived: snapshotP1.totalGarbageReceived,
      board: serializeBoard(gameP1.getBoard()),
    },
    p2: {
      score: gameP2.getStats().score,
      lines: gameP2.getStats().lines,
      moves: snapshotP2.moves,
      garbageSent: snapshotP2.totalGarbageSent,
      garbageReceived: snapshotP2.totalGarbageReceived,
      board: serializeBoard(gameP2.getBoard()),
    },
  };

  return { summary, historyP1: histories[0], historyP2: histories[1] };
}

function takeStep(
  environment: VersusEnvironment,
  playerIndex: 0 | 1,
  agentP1: PatternInferenceAgent,
  agentP2: PatternInferenceAgent,
): VersusStepResult {
  if (playerIndex === 0) {
    return environment.actWithAgent(0, agentP1);
  }
  return environment.actWithAgent(1, agentP2);
}

export function runVersusTraining(
  options: VersusTrainingOptions,
): VersusTrainingRunResult {
  const evaluatorP1 = buildEvaluator(options.initialWeightsP1, options.learningRateP1);
  const evaluatorP2 = buildEvaluator(options.initialWeightsP2, options.learningRateP2);

  const agentP1 = new PatternInferenceAgent(evaluatorP1, {
    enableHold: true,
    explorationRate: options.explorationRateP1,
  });
  const agentP2 = new PatternInferenceAgent(evaluatorP2, {
    enableHold: true,
    explorationRate: options.explorationRateP2,
  });

  const summaries: VersusEpisodeSummary[] = [];
  let winsP1 = 0;
  let winsP2 = 0;
  let ties = 0;

  for (let episode = 0; episode < options.episodes; episode += 1) {
    const { summary, historyP1, historyP2 } = runMatch(
      agentP1,
      agentP2,
      options,
      episode,
    );
    if (historyP1.length > 0) {
      updateFromHistory(historyP1, evaluatorP1, options.gamma);
    }
    if (historyP2.length > 0) {
      updateFromHistory(historyP2, evaluatorP2, options.gamma);
    }

    if (summary.winner === 0) {
      winsP1 += 1;
    } else if (summary.winner === 1) {
      winsP2 += 1;
    } else {
      ties += 1;
    }

    summaries.push(summary);
  }

  const aggregates = summaries.reduce(
    (acc, item) => {
      acc.p1.score += item.p1.score;
      acc.p1.lines += item.p1.lines;
      acc.p1.garbageSent += item.p1.garbageSent;
      acc.p1.garbageReceived += item.p1.garbageReceived;
      acc.p2.score += item.p2.score;
      acc.p2.lines += item.p2.lines;
      acc.p2.garbageSent += item.p2.garbageSent;
      acc.p2.garbageReceived += item.p2.garbageReceived;
      return acc;
    },
    {
      p1: { score: 0, lines: 0, garbageSent: 0, garbageReceived: 0 },
      p2: { score: 0, lines: 0, garbageSent: 0, garbageReceived: 0 },
    },
  );

  const divisor = Math.max(summaries.length, 1);

  return {
    summaries,
    evaluatorConfigP1: evaluatorP1.serialize(),
    evaluatorConfigP2: evaluatorP2.serialize(),
    winCounts: { p1: winsP1, p2: winsP2, ties },
    averages: {
      p1: {
        score: aggregates.p1.score / divisor,
        lines: aggregates.p1.lines / divisor,
        garbageSent: aggregates.p1.garbageSent / divisor,
        garbageReceived: aggregates.p1.garbageReceived / divisor,
      },
      p2: {
        score: aggregates.p2.score / divisor,
        lines: aggregates.p2.lines / divisor,
        garbageSent: aggregates.p2.garbageSent / divisor,
        garbageReceived: aggregates.p2.garbageReceived / divisor,
      },
    },
  };
}
