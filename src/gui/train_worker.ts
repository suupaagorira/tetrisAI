import { parentPort, workerData } from 'worker_threads';

import { runTrainingEpisodes, TrainingRunResult } from '../training/engine';
import type { EvaluatorConfig } from '../ai/evaluator';

interface WorkerOptions {
  episodes: number;
  maxSteps: number;
  gamma: number;
  learningRate: number;
  explorationRate: number;
}

interface WorkerData {
  baseConfig: EvaluatorConfig;
  options: WorkerOptions;
}

function main(): void {
  const data = workerData as WorkerData;
  try {
    const result: TrainingRunResult = runTrainingEpisodes({
      episodes: data.options.episodes,
      maxSteps: data.options.maxSteps,
      gamma: data.options.gamma,
      learningRate: data.options.learningRate,
      explorationRate: data.options.explorationRate,
      initialWeights: data.baseConfig,
    });
    parentPort?.postMessage(result);
  } catch (error) {
    parentPort?.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

main();
