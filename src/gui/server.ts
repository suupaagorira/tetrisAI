import express from 'express';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { build, context, type BuildOptions } from 'esbuild';

import { DEFAULT_WEIGHTS, EvaluatorConfig } from '../ai/evaluator';
import type { EpisodeSummary, TrainingRunResult } from '../training/engine';

type BuildContext = Awaited<ReturnType<typeof context>>;
const activeWatchContexts: BuildContext[] = [];

const TRAIN_PARALLELISM = Number(process.env.GUI_TRAIN_PARALLEL ?? 100);
const TRAIN_EPISODES_PER_JOB = Number(process.env.GUI_TRAIN_EPISODES ?? 1);
const TRAIN_MAX_STEPS = Number(process.env.GUI_TRAIN_MAX_STEPS ?? 5000);
const TRAIN_GAMMA = Number(process.env.GUI_TRAIN_GAMMA ?? 0.99);
const TRAIN_LEARNING_RATE = Number(process.env.GUI_TRAIN_LR ?? 0.001);
const TRAIN_EXPLORATION = Number(process.env.GUI_TRAIN_EXPLORATION ?? 0.05);

interface TrainingStatus {
  running: boolean;
  cycle: number;
  batchSize: number;
  averageScore: number;
  averageLines: number;
  bestScore: number;
  previewBoard: number[][];
  updatedAt: string | null;
  message?: string;
}

interface TrainingController {
  running: boolean;
  stopRequested: boolean;
  status: TrainingStatus;
  loopPromise: Promise<void> | null;
}

const trainingController: TrainingController = {
  running: false,
  stopRequested: false,
  loopPromise: null,
  status: {
    running: false,
    cycle: 0,
    batchSize: TRAIN_PARALLELISM,
    averageScore: 0,
    averageLines: 0,
    bestScore: 0,
    previewBoard: [],
    updatedAt: null,
  },
};

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function bundleClient(projectRoot: string, watch = false): Promise<void> {
  const outDir = path.resolve(projectRoot, 'dist', 'gui');
  await ensureDir(outDir);

  const clientOptions: BuildOptions = {
    entryPoints: [path.resolve(projectRoot, 'src', 'gui', 'client.ts')],
    outfile: path.join(outDir, 'client.js'),
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    target: ['es2018'],
    format: 'esm',
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV ?? (watch ? 'development' : 'production'),
      ),
    },
  };

  const workerOptions: BuildOptions = {
    entryPoints: [path.resolve(projectRoot, 'src', 'gui', 'train_worker.ts')],
    outfile: path.join(outDir, 'train_worker.js'),
    bundle: true,
    platform: 'node',
    target: ['node20'],
    format: 'cjs',
    logLevel: 'info',
  };

  if (watch) {
    const clientCtx = await context(clientOptions);
    await clientCtx.watch();
    activeWatchContexts.push(clientCtx);

    const workerCtx = await context(workerOptions);
    await workerCtx.watch();
    activeWatchContexts.push(workerCtx);
  } else {
    await build(clientOptions);
    await build(workerOptions);
  }
}

function normaliseWeights(config?: EvaluatorConfig): EvaluatorConfig {
  const baseWeights = config?.weights ?? {};
  return {
    weights: { ...DEFAULT_WEIGHTS, ...baseWeights },
    bias: config?.bias ?? 0,
    learningRate: config?.learningRate ?? TRAIN_LEARNING_RATE,
  };
}

async function loadWeights(projectRoot: string): Promise<EvaluatorConfig> {
  const file = path.resolve(projectRoot, 'weights.json');
  try {
    const raw = await fs.promises.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as EvaluatorConfig;
    return normaliseWeights(parsed);
  } catch {
    return normaliseWeights();
  }
}

async function saveWeights(projectRoot: string, config: EvaluatorConfig): Promise<void> {
  const file = path.resolve(projectRoot, 'weights.json');
  await fs.promises.writeFile(file, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
  });
}

function averageEvaluatorConfigs(configs: EvaluatorConfig[]): EvaluatorConfig {
  if (configs.length === 0) {
    return normaliseWeights();
  }
  const weightKeys = new Set<string>();
  configs.forEach((cfg) => {
    Object.keys(cfg.weights ?? {}).forEach((key) => weightKeys.add(key));
  });
  const averagedWeights: Record<string, number> = {};
  weightKeys.forEach((key) => {
    let sum = 0;
    configs.forEach((cfg) => {
      sum += cfg.weights?.[key] ?? 0;
    });
    averagedWeights[key] = sum / configs.length;
  });
  const biasAvg =
    configs.reduce((sum, cfg) => sum + (cfg.bias ?? 0), 0) / configs.length;
  const learningRateAvg =
    configs.reduce((sum, cfg) => sum + (cfg.learningRate ?? TRAIN_LEARNING_RATE), 0) /
    configs.length;
  return {
    weights: averagedWeights,
    bias: biasAvg,
    learningRate: learningRateAvg,
  };
}

function pickBestEpisode(results: TrainingRunResult[]): EpisodeSummary | null {
  let best: EpisodeSummary | null = null;
  for (const result of results) {
    for (const summary of result.summaries) {
      if (!best || summary.score > best.score) {
        best = summary;
      }
    }
  }
  return best;
}

function runTrainingWorker(
  workerPath: string,
  baseConfig: EvaluatorConfig,
): Promise<TrainingRunResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        baseConfig,
        options: {
          episodes: TRAIN_EPISODES_PER_JOB,
          maxSteps: TRAIN_MAX_STEPS,
          gamma: TRAIN_GAMMA,
          learningRate: TRAIN_LEARNING_RATE,
          explorationRate: TRAIN_EXPLORATION,
        },
      },
    });
    worker.once('message', (message: TrainingRunResult | { error: string }) => {
      if ('error' in message) {
        reject(new Error(message.error));
      } else {
        resolve(message);
      }
    });
    worker.once('error', (error) => {
      reject(error);
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

interface TrainingBatchResult {
  newConfig: EvaluatorConfig;
  averageScore: number;
  averageLines: number;
  bestEpisode: EpisodeSummary | null;
}

async function runTrainingBatch(
  workerPath: string,
  baseConfig: EvaluatorConfig,
): Promise<TrainingBatchResult> {
  const tasks = Array.from({ length: TRAIN_PARALLELISM }, () => runTrainingWorker(workerPath, baseConfig));
  const results = await Promise.all(tasks);

  let scoreSum = 0;
  let lineSum = 0;
  let episodeCount = 0;
  results.forEach((result) => {
    result.summaries.forEach((summary) => {
      scoreSum += summary.score;
      lineSum += summary.lines;
      episodeCount += 1;
    });
  });

  const newConfig = averageEvaluatorConfigs(results.map((result) => result.evaluatorConfig));
  const bestEpisode = pickBestEpisode(results);

  return {
    newConfig,
    averageScore: episodeCount > 0 ? scoreSum / episodeCount : 0,
    averageLines: episodeCount > 0 ? lineSum / episodeCount : 0,
    bestEpisode,
  };
}

async function runTrainingLoop(projectRoot: string, workerPath: string): Promise<void> {
  if (trainingController.running) {
    return;
  }
  trainingController.running = true;
  trainingController.stopRequested = false;
  trainingController.status.running = true;

  while (!trainingController.stopRequested) {
    try {
      const baseConfig = await loadWeights(projectRoot);
      const batch = await runTrainingBatch(workerPath, baseConfig);
      await saveWeights(projectRoot, batch.newConfig);

      trainingController.status.cycle += 1;
      trainingController.status.averageScore = batch.averageScore;
      trainingController.status.averageLines = batch.averageLines;
      trainingController.status.bestScore = batch.bestEpisode?.score ?? 0;
      trainingController.status.previewBoard = batch.bestEpisode?.board ?? [];
      trainingController.status.updatedAt = new Date().toISOString();
      delete trainingController.status.message;
    } catch (error) {
      trainingController.status.message =
        error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('Training batch failed:', error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  trainingController.running = false;
  trainingController.status.running = false;
  trainingController.loopPromise = null;
}

function createServer(projectRoot: string, workerPath: string) {
  const app = express();
  const publicDir = path.resolve(projectRoot, 'public');
  const assetsDir = path.resolve(projectRoot, 'dist', 'gui');

  app.use(express.json());

  app.use('/assets', express.static(assetsDir, { fallthrough: true }));
  app.use(express.static(publicDir, { fallthrough: true }));

  app.post('/api/train/start', async (_req, res) => {
    if (trainingController.running) {
      res.json({ status: trainingController.status });
      return;
    }
    trainingController.loopPromise = runTrainingLoop(projectRoot, workerPath);
    res.json({ status: trainingController.status });
  });

  app.post('/api/train/stop', (_req, res) => {
    trainingController.stopRequested = true;
    res.json({ status: trainingController.status });
  });

  app.get('/api/train/status', (_req, res) => {
    res.json(trainingController.status);
  });

  app.use((_req, res) => {
    res.status(404).send('Not Found');
  });

  return app;
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const port = Number(process.env.GUI_PORT ?? 5173);
  const watch = process.argv.includes('--watch');

  await bundleClient(projectRoot, watch);
  const workerPath = path.resolve(projectRoot, 'dist', 'gui', 'train_worker.js');
  const app = createServer(projectRoot, workerPath);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `Tetris GUI server running at http://localhost:${port} (watch=${watch})`,
    );
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
