import fs from 'fs';
import path from 'path';

import { DEFAULT_WEIGHTS, EvaluatorConfig } from '../ai/evaluator';
import { runVersusTraining } from './versus_engine';

const EPISODES = Number(process.env.EPISODES ?? 10);
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 2000);
const GAMMA = Number(process.env.GAMMA ?? 0.99);

const LEARNING_RATE_P1 = Number(process.env.LEARNING_RATE_P1 ?? 0.001);
const LEARNING_RATE_P2 = Number(process.env.LEARNING_RATE_P2 ?? 0.001);

const EXPLORATION_P1 = Number(process.env.EXPLORATION_P1 ?? 0.02);
const EXPLORATION_P2 = Number(process.env.EXPLORATION_P2 ?? 0.02);

const WEIGHTS_P1_PATH = process.env.WEIGHTS_P1_PATH ?? 'weights_p1.json';
const WEIGHTS_P2_PATH = process.env.WEIGHTS_P2_PATH ?? 'weights_p2.json';

const SEED_BASE = Number(process.env.VERSUS_SEED_BASE ?? 1000);

function loadInitialWeights(
  weightsPath: string,
  fallbackLearningRate: number,
): EvaluatorConfig {
  const resolved = path.resolve(process.cwd(), weightsPath);
  if (!fs.existsSync(resolved)) {
    return {
      weights: { ...DEFAULT_WEIGHTS },
      bias: 0,
      learningRate: fallbackLearningRate,
    };
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<EvaluatorConfig>;
    return {
      weights: { ...DEFAULT_WEIGHTS, ...(parsed.weights ?? {}) },
      bias: parsed.bias ?? 0,
      learningRate: parsed.learningRate ?? fallbackLearningRate,
    };
  } catch {
    return {
      weights: { ...DEFAULT_WEIGHTS },
      bias: 0,
      learningRate: fallbackLearningRate,
    };
  }
}

function writeWeights(targetPath: string, config: EvaluatorConfig): void {
  const resolved = path.resolve(process.cwd(), targetPath);
  fs.writeFileSync(resolved, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function main(): void {
  const initialP1 = loadInitialWeights(WEIGHTS_P1_PATH, LEARNING_RATE_P1);
  const initialP2 = loadInitialWeights(WEIGHTS_P2_PATH, LEARNING_RATE_P2);

  const result = runVersusTraining({
    episodes: EPISODES,
    maxSteps: MAX_STEPS,
    gamma: GAMMA,
    learningRateP1: LEARNING_RATE_P1,
    learningRateP2: LEARNING_RATE_P2,
    explorationRateP1: EXPLORATION_P1,
    explorationRateP2: EXPLORATION_P2,
    initialWeightsP1: initialP1,
    initialWeightsP2: initialP2,
    seedBase: SEED_BASE,
  });

  writeWeights(WEIGHTS_P1_PATH, result.evaluatorConfigP1);
  writeWeights(WEIGHTS_P2_PATH, result.evaluatorConfigP2);

  const p1Avg = result.averages.p1;
  const p2Avg = result.averages.p2;
  const wins = result.winCounts;

  // eslint-disable-next-line no-console
  console.log(
    `Versus training complete: episodes=${EPISODES}, P1 avgScore=${formatNumber(
      p1Avg.score,
    )} avgLines=${formatNumber(p1Avg.lines)} wins=${wins.p1}, P2 avgScore=${formatNumber(
      p2Avg.score,
    )} avgLines=${formatNumber(p2Avg.lines)} wins=${wins.p2}, ties=${wins.ties}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Weights saved -> P1: ${path.resolve(process.cwd(), WEIGHTS_P1_PATH)}, P2: ${path.resolve(process.cwd(), WEIGHTS_P2_PATH)}`,
  );
}

main();
