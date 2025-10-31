import { FeatureVector } from './features';

export interface EvaluatorConfig {
  weights: Record<string, number>;
  bias?: number;
  learningRate?: number;
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  bias: 0,
  lines_cleared: 1.0,
  tetris: 1.5,
  tspin: 2.0,
  tspin_mini: 0.6,
  back_to_back: 0.8,
  combo: 0.8,
  combo_active: 0.2,
  aggregate_height: -0.6,
  max_height: -0.4,
  holes: -0.9,
  bumpiness: -0.3,
  wells: -0.45,
  row_transitions: -0.3,
  column_transitions: -0.35,
  occupancy: -0.1,
  surface_roughness: -0.25,
  drop_distance: -0.05,
  score_gain: 0.1,
  perfect_clear: 5.0,
  wasted_placement: -0.5,
  game_over: -1000,
  gaps: -0.4,
};

export class LinearEvaluator {
  private weights: Record<string, number>;
  private bias: number;
  private learningRate: number;

  constructor(config: EvaluatorConfig = { weights: DEFAULT_WEIGHTS }) {
    this.weights = { ...config.weights };
    this.bias = config.bias ?? 0;
    this.learningRate = config.learningRate ?? 0.01;
  }

  evaluate(features: FeatureVector): number {
    let value = this.bias;
    for (const [name, featureValue] of Object.entries(features.values)) {
      const weight = this.weights[name] ?? 0;
      value += weight * featureValue;
    }
    return value;
  }

  predict(features: FeatureVector): number {
    return this.evaluate(features);
  }

  train(features: FeatureVector, target: number): void {
    const prediction = this.predict(features);
    const error = target - prediction;
    for (const [name, featureValue] of Object.entries(features.values)) {
      const currentWeight = this.weights[name] ?? 0;
      this.weights[name] = currentWeight + this.learningRate * error * featureValue;
    }
    this.bias += this.learningRate * error;
  }

  getWeights(): Record<string, number> {
    return { ...this.weights };
  }

  setWeights(weights: Record<string, number>): void {
    this.weights = { ...weights };
  }

  setLearningRate(rate: number): void {
    this.learningRate = rate;
  }

  serialize(): EvaluatorConfig {
    return {
      weights: { ...this.weights },
      bias: this.bias,
      learningRate: this.learningRate,
    };
  }
}
