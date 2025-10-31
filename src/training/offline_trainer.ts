import fs from 'fs';
import path from 'path';

import { TetrisGame } from '../core/game';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../ai/evaluator';
import { PatternInferenceAgent } from '../ai/agent';
import { FeatureVector } from '../ai/features';

interface Experience {
  features: FeatureVector;
  reward: number;
}

const EPISODES = Number(process.env.EPISODES ?? 20);
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 10000);
const GAMMA = Number(process.env.GAMMA ?? 0.99);
const LEARNING_RATE = Number(process.env.LEARNING_RATE ?? 0.001);
const OUTPUT_PATH = process.env.WEIGHTS_PATH ?? 'weights.json';

function cloneFeatures(vector: FeatureVector): FeatureVector {
  return { values: { ...vector.values } };
}

function updateFromHistory(
  history: Experience[],
  evaluator: LinearEvaluator,
  gamma: number,
): void {
  let returnValue = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const experience = history[i]!;
    returnValue = experience.reward + gamma * returnValue;
    evaluator.train(experience.features, returnValue);
  }
}

function runEpisode(
  agent: PatternInferenceAgent,
  evaluator: LinearEvaluator,
): { score: number; lines: number; moves: number } {
  const game = new TetrisGame();
  const history: Experience[] = [];
  let moves = 0;
  while (!game.isGameOver() && moves < MAX_STEPS) {
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
    updateFromHistory(history, evaluator, GAMMA);
  }
  const finalStats = game.getStats();
  return {
    score: finalStats.score,
    lines: finalStats.lines,
    moves,
  };
}

function main(): void {
  const evaluator = new LinearEvaluator({
    weights: DEFAULT_WEIGHTS,
    learningRate: LEARNING_RATE,
  });
  const agent = new PatternInferenceAgent(evaluator, {
    enableHold: true,
    explorationRate: Number(process.env.EXPLORATION ?? 0.05),
  });

  const summaries: { score: number; lines: number; moves: number }[] = [];
  for (let episode = 0; episode < EPISODES; episode += 1) {
    const result = runEpisode(agent, evaluator);
    summaries.push(result);
    if ((episode + 1) % 5 === 0 || episode === EPISODES - 1) {
      // eslint-disable-next-line no-console
      console.log(
        `Episode ${episode + 1}: score=${result.score}, lines=${result.lines}, moves=${result.moves}`,
      );
    }
  }

  const averageScore =
    summaries.reduce((sum, item) => sum + item.score, 0) / summaries.length;
  const averageLines =
    summaries.reduce((sum, item) => sum + item.lines, 0) / summaries.length;

  const output = path.resolve(process.cwd(), OUTPUT_PATH);
  fs.writeFileSync(output, JSON.stringify(evaluator.serialize(), null, 2), {
    encoding: 'utf-8',
  });
  // eslint-disable-next-line no-console
  console.log(
    `Training completed. Avg. score=${averageScore.toFixed(2)}, avg. lines=${averageLines.toFixed(2)}. Weights saved to ${output}`,
  );
}

main();
