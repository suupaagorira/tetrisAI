import fs from 'fs';
import path from 'path';

import { DEFAULT_WEIGHTS, EvaluatorConfig } from '../ai/evaluator';
import { runTrainingEpisodes } from './engine';

const EPISODES = Number(process.env.EPISODES ?? 20);
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 10000);
const GAMMA = Number(process.env.GAMMA ?? 0.99);
const LEARNING_RATE = Number(process.env.LEARNING_RATE ?? 0.001);
const EXPLORATION = Number(process.env.EXPLORATION ?? 0.05);
const OUTPUT_PATH = process.env.WEIGHTS_PATH ?? 'weights.json';

function loadInitialWeights(): EvaluatorConfig {
  const resolved = path.resolve(process.cwd(), OUTPUT_PATH);
  if (!fs.existsSync(resolved)) {
    return { weights: { ...DEFAULT_WEIGHTS }, bias: 0, learningRate: LEARNING_RATE };
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as EvaluatorConfig;
    return {
      weights: { ...DEFAULT_WEIGHTS, ...(parsed.weights ?? {}) },
      bias: parsed.bias ?? 0,
      learningRate: parsed.learningRate ?? LEARNING_RATE,
    };
  } catch {
    return { weights: { ...DEFAULT_WEIGHTS }, bias: 0, learningRate: LEARNING_RATE };
  }
}

function main(): void {
  const initialWeights = loadInitialWeights();
  const result = runTrainingEpisodes({
    episodes: EPISODES,
    maxSteps: MAX_STEPS,
    gamma: GAMMA,
    learningRate: LEARNING_RATE,
    explorationRate: EXPLORATION,
    initialWeights,
  });

  const output = path.resolve(process.cwd(), OUTPUT_PATH);
  fs.writeFileSync(output, JSON.stringify(result.evaluatorConfig, null, 2), {
    encoding: 'utf-8',
  });

  // eslint-disable-next-line no-console
  console.log(
    `Training completed. Avg. score=${result.averageScore.toFixed(
      2,
    )}, avg. lines=${result.averageLines.toFixed(2)}. Weights saved to ${output}`,
  );
}

main();
