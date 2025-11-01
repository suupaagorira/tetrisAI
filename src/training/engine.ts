import { TetrisGame } from '../core/game';
import { LinearEvaluator, EvaluatorConfig } from '../ai/evaluator';
import { PatternInferenceAgent } from '../ai/agent';
import {
  cloneFeatures,
  serializeBoard,
  updateFromHistory,
  normaliseConfig,
  Experience,
} from './common';

export interface TrainingOptions {
  episodes: number;
  maxSteps: number;
  gamma: number;
  learningRate: number;
  explorationRate: number;
  initialWeights?: EvaluatorConfig;
}

export interface EpisodeSummary {
  score: number;
  lines: number;
  moves: number;
  board: number[][];
}

export interface TrainingRunResult {
  summaries: EpisodeSummary[];
  averageScore: number;
  averageLines: number;
  evaluatorConfig: EvaluatorConfig;
}

function runEpisode(
  agent: PatternInferenceAgent,
  evaluator: LinearEvaluator,
  maxSteps: number,
  gamma: number,
): EpisodeSummary {
  const game = new TetrisGame();
  const history: Experience[] = [];
  let moves = 0;
  while (!game.isGameOver() && moves < maxSteps) {
    const beforeStats = game.getStats();
    const outcome = agent.act(game);
    if (!outcome) {
      break;
    }
    const afterStats = game.getStats();
    const reward = afterStats.score - beforeStats.score;
    history.push({
      features: cloneFeatures(outcome.features),
      reward,
    });
    moves += 1;
  }
  if (history.length > 0) {
    updateFromHistory(history, evaluator, gamma);
  }
  const finalStats = game.getStats();
  return {
    score: finalStats.score,
    lines: finalStats.lines,
    moves,
    board: serializeBoard(game.getBoard()),
  };
}

export function runTrainingEpisodes(options: TrainingOptions): TrainingRunResult {
  const initialConfig = normaliseConfig(options.initialWeights, options.learningRate);
  const effectiveLearningRate = options.learningRate;
  const bias = initialConfig.bias ?? 0;
  const evaluator = new LinearEvaluator({
    weights: initialConfig.weights,
    bias,
    learningRate: effectiveLearningRate,
  });
  if (effectiveLearningRate !== initialConfig.learningRate) {
    evaluator.setLearningRate(effectiveLearningRate);
  }

  const agent = new PatternInferenceAgent(evaluator, {
    enableHold: true,
    explorationRate: options.explorationRate,
  });

  const summaries: EpisodeSummary[] = [];
  for (let episode = 0; episode < options.episodes; episode += 1) {
    const result = runEpisode(agent, evaluator, options.maxSteps, options.gamma);
    summaries.push(result);
  }

  const averageScore =
    summaries.reduce((sum, item) => sum + item.score, 0) / Math.max(summaries.length, 1);
  const averageLines =
    summaries.reduce((sum, item) => sum + item.lines, 0) / Math.max(summaries.length, 1);

  const evaluatorConfig = evaluator.serialize();
  return {
    summaries,
    averageScore,
    averageLines,
    evaluatorConfig,
  };
}

