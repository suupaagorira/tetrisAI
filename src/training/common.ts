import { MatrixBoard } from '../core/board';
import { LinearEvaluator, DEFAULT_WEIGHTS, EvaluatorConfig } from '../ai/evaluator';
import { FeatureVector } from '../ai/features';

export interface Experience {
  features: FeatureVector;
  reward: number;
}

export function cloneFeatures(vector: FeatureVector): FeatureVector {
  return { values: { ...vector.values } };
}

export function serializeBoard(board: MatrixBoard): number[][] {
  const rows: number[][] = [];
  for (let y = board.hiddenRows; y < board.height; y += 1) {
    const sourceRow = board.cells[y];
    if (!sourceRow) {
      continue;
    }
    rows.push([...sourceRow]);
  }
  return rows;
}

export function updateFromHistory(
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

export function normaliseConfig(
  config: EvaluatorConfig | undefined,
  fallbackLearningRate = 0.01,
): EvaluatorConfig {
  const mergedWeights: Record<string, number> = { ...DEFAULT_WEIGHTS };
  if (config?.weights) {
    for (const [name, value] of Object.entries(config.weights)) {
      mergedWeights[name] = value;
    }
  }
  return {
    weights: mergedWeights,
    bias: config?.bias ?? 0,
    learningRate: config?.learningRate ?? fallbackLearningRate,
  };
}
