import { parentPort, workerData } from 'worker_threads';

import { runVersusTraining } from '../training/versus_engine';
import type { EvaluatorConfig } from '../ai/evaluator';

interface WorkerOptions {
  episodes: number;
  maxSteps: number;
  gamma: number;
  learningRateP1: number;
  learningRateP2: number;
  explorationRateP1: number;
  explorationRateP2: number;
  seedBase: number;
}

interface WorkerData {
  baseConfigP1: EvaluatorConfig;
  baseConfigP2: EvaluatorConfig;
  options: WorkerOptions;
}

function main(): void {
  const data = workerData as WorkerData;
  try {
    const result = runVersusTraining({
      episodes: data.options.episodes,
      maxSteps: data.options.maxSteps,
      gamma: data.options.gamma,
      learningRateP1: data.options.learningRateP1,
      learningRateP2: data.options.learningRateP2,
      explorationRateP1: data.options.explorationRateP1,
      explorationRateP2: data.options.explorationRateP2,
      seedBase: data.options.seedBase,
      initialWeightsP1: data.baseConfigP1,
      initialWeightsP2: data.baseConfigP2,
    });
    parentPort?.postMessage(result);
  } catch (error) {
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

main();

