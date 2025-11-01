import { build, context, type BuildOptions } from 'esbuild';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

import { DEFAULT_WEIGHTS, EvaluatorConfig } from '../ai/evaluator';
import type { EpisodeSummary, TrainingRunResult } from '../training/engine';
import type { VersusTrainingRunResult } from '../training/versus_engine';

type BuildContext = Awaited<ReturnType<typeof context>>;
const activeWatchContexts: BuildContext[] = [];

const TRAIN_PARALLELISM = Number(process.env.GUI_TRAIN_PARALLEL ?? 100);
const TRAIN_EPISODES_PER_JOB = Number(process.env.GUI_TRAIN_EPISODES ?? 1);
const TRAIN_MAX_STEPS = Number(process.env.GUI_TRAIN_MAX_STEPS ?? 5000);
const TRAIN_GAMMA = Number(process.env.GUI_TRAIN_GAMMA ?? 0.99);
const TRAIN_LEARNING_RATE = Number(process.env.GUI_TRAIN_LR ?? 0.001);
const TRAIN_EXPLORATION = Number(process.env.GUI_TRAIN_EXPLORATION ?? 0.05);

const VERSUS_TRAIN_PARALLELISM = Number(process.env.GUI_VERSUS_TRAIN_PARALLEL ?? 10);
const VERSUS_TRAIN_EPISODES = Number(process.env.GUI_VERSUS_TRAIN_EPISODES ?? 5);
const VERSUS_TRAIN_MAX_STEPS = Number(process.env.GUI_VERSUS_TRAIN_MAX_STEPS ?? 2000);
const VERSUS_TRAIN_GAMMA = Number(process.env.GUI_VERSUS_TRAIN_GAMMA ?? 0.99);
const VERSUS_TRAIN_LR_P1 = Number(process.env.GUI_VERSUS_TRAIN_LR_P1 ?? 0.001);
const VERSUS_TRAIN_LR_P2 = Number(process.env.GUI_VERSUS_TRAIN_LR_P2 ?? 0.001);
const VERSUS_TRAIN_EXPLORATION_P1 = Number(
  process.env.GUI_VERSUS_TRAIN_EXPLORATION_P1 ?? 0.02,
);
const VERSUS_TRAIN_EXPLORATION_P2 = Number(
  process.env.GUI_VERSUS_TRAIN_EXPLORATION_P2 ?? 0.02,
);
const VERSUS_TRAIN_SEED_BASE = Number(process.env.GUI_VERSUS_TRAIN_SEED_BASE ?? 1000);

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

interface VersusTrainingStatus {
  running: boolean;
  cycle: number;
  batchSize: number;
  episodesPerBatch: number;
  averageScore: { p1: number; p2: number };
  averageLines: { p1: number; p2: number };
  wins: { p1: number; p2: number; ties: number };
  previewBoardP1: number[][];
  previewBoardP2: number[][];
  updatedAt: string | null;
  message?: string;
}

interface VersusTrainingController {
  running: boolean;
  stopRequested: boolean;
  status: VersusTrainingStatus;
  loopPromise: Promise<void> | null;
}

const versusTrainingController: VersusTrainingController = {
  running: false,
  stopRequested: false,
  loopPromise: null,
  status: {
    running: false,
    cycle: 0,
    batchSize: VERSUS_TRAIN_PARALLELISM,
    episodesPerBatch: VERSUS_TRAIN_EPISODES,
    averageScore: { p1: 0, p2: 0 },
    averageLines: { p1: 0, p2: 0 },
    wins: { p1: 0, p2: 0, ties: 0 },
    previewBoardP1: [],
    previewBoardP2: [],
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

  const versusOptions: BuildOptions = {
    entryPoints: [path.resolve(projectRoot, 'src', 'gui', 'versus_client.ts')],
    outfile: path.join(outDir, 'versus_client.js'),
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
    external: ['worker_threads'],
  };

  const versusWorkerOptions: BuildOptions = {
    entryPoints: [path.resolve(projectRoot, 'src', 'gui', 'versus_train_worker.ts')],
    outfile: path.join(outDir, 'versus_train_worker.js'),
    bundle: true,
    platform: 'node',
    target: ['node20'],
    format: 'cjs',
    logLevel: 'info',
    external: ['worker_threads'],
  };

  if (watch) {
    const clientCtx = await context(clientOptions);
    await clientCtx.watch();
    activeWatchContexts.push(clientCtx);

    const versusCtx = await context(versusOptions);
    await versusCtx.watch();
    activeWatchContexts.push(versusCtx);

    const workerCtx = await context(workerOptions);
    await workerCtx.watch();
    activeWatchContexts.push(workerCtx);

    const versusWorkerCtx = await context(versusWorkerOptions);
    await versusWorkerCtx.watch();
    activeWatchContexts.push(versusWorkerCtx);
  } else {
    await build(clientOptions);
    await build(versusOptions);
    await build(workerOptions);
    await build(versusWorkerOptions);
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

async function loadWeightsFile(
  projectRoot: string,
  fileName: string,
): Promise<EvaluatorConfig> {
  const file = path.resolve(projectRoot, fileName);
  try {
    const raw = await fs.promises.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw) as EvaluatorConfig;
    return normaliseWeights(parsed);
  } catch {
    return normaliseWeights();
  }
}

async function loadWeights(projectRoot: string): Promise<EvaluatorConfig> {
  return loadWeightsFile(projectRoot, 'weights.json');
}

async function loadVersusWeights(projectRoot: string): Promise<{
  p1: EvaluatorConfig;
  p2: EvaluatorConfig;
}> {
  const [p1, p2] = await Promise.all([
    loadWeightsFile(projectRoot, 'weights_p1.json'),
    loadWeightsFile(projectRoot, 'weights_p2.json'),
  ]);
  return { p1, p2 };
}

async function saveWeights(projectRoot: string, config: EvaluatorConfig): Promise<void> {
  const file = path.resolve(projectRoot, 'weights.json');
  await fs.promises.writeFile(file, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
  });
}

async function saveVersusWeights(
  projectRoot: string,
  configs: { p1: EvaluatorConfig; p2: EvaluatorConfig },
): Promise<void> {
  const [p1Path, p2Path] = [
    path.resolve(projectRoot, 'weights_p1.json'),
    path.resolve(projectRoot, 'weights_p2.json'),
  ];
  await Promise.all([
    fs.promises.writeFile(p1Path, JSON.stringify(configs.p1, null, 2), {
      encoding: 'utf-8',
    }),
    fs.promises.writeFile(p2Path, JSON.stringify(configs.p2, null, 2), {
      encoding: 'utf-8',
    }),
  ]);
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

function runVersusTrainingWorker(
  workerPath: string,
  baseConfig: { p1: EvaluatorConfig; p2: EvaluatorConfig },
): Promise<VersusTrainingRunResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        baseConfigP1: baseConfig.p1,
        baseConfigP2: baseConfig.p2,
        options: {
          episodes: VERSUS_TRAIN_EPISODES,
          maxSteps: VERSUS_TRAIN_MAX_STEPS,
          gamma: VERSUS_TRAIN_GAMMA,
          learningRateP1: VERSUS_TRAIN_LR_P1,
          learningRateP2: VERSUS_TRAIN_LR_P2,
          explorationRateP1: VERSUS_TRAIN_EXPLORATION_P1,
          explorationRateP2: VERSUS_TRAIN_EXPLORATION_P2,
          seedBase: VERSUS_TRAIN_SEED_BASE,
        },
      },
    });
    worker.once('message', (message: VersusTrainingRunResult | { error: string }) => {
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
        reject(new Error(`Versus training worker exited with code ${code}`));
      }
    });
  });
}

async function runVersusTrainingBatch(
  workerPath: string,
  baseConfig: { p1: EvaluatorConfig; p2: EvaluatorConfig },
): Promise<VersusTrainingRunResult> {
  const tasks = Array.from({ length: VERSUS_TRAIN_PARALLELISM }, () =>
    runVersusTrainingWorker(workerPath, baseConfig),
  );
  const results = await Promise.all(tasks);

  // Aggregate configs from all workers
  const configsP1 = results.map((result) => result.evaluatorConfigP1);
  const configsP2 = results.map((result) => result.evaluatorConfigP2);
  const averagedConfigP1 = averageEvaluatorConfigs(configsP1);
  const averagedConfigP2 = averageEvaluatorConfigs(configsP2);

  // Aggregate statistics
  let totalWinsP1 = 0;
  let totalWinsP2 = 0;
  let totalTies = 0;
  let totalScoreP1 = 0;
  let totalScoreP2 = 0;
  let totalLinesP1 = 0;
  let totalLinesP2 = 0;
  let totalGarbageSentP1 = 0;
  let totalGarbageSentP2 = 0;
  let totalGarbageReceivedP1 = 0;
  let totalGarbageReceivedP2 = 0;
  const allSummaries = [];

  for (const result of results) {
    totalWinsP1 += result.winCounts.p1;
    totalWinsP2 += result.winCounts.p2;
    totalTies += result.winCounts.ties;
    totalScoreP1 += result.averages.p1.score;
    totalScoreP2 += result.averages.p2.score;
    totalLinesP1 += result.averages.p1.lines;
    totalLinesP2 += result.averages.p2.lines;
    totalGarbageSentP1 += result.averages.p1.garbageSent;
    totalGarbageSentP2 += result.averages.p2.garbageSent;
    totalGarbageReceivedP1 += result.averages.p1.garbageReceived;
    totalGarbageReceivedP2 += result.averages.p2.garbageReceived;
    allSummaries.push(...result.summaries);
  }

  const workerCount = results.length;

  return {
    summaries: allSummaries,
    evaluatorConfigP1: averagedConfigP1,
    evaluatorConfigP2: averagedConfigP2,
    winCounts: {
      p1: totalWinsP1,
      p2: totalWinsP2,
      ties: totalTies,
    },
    averages: {
      p1: {
        score: totalScoreP1 / workerCount,
        lines: totalLinesP1 / workerCount,
        garbageSent: totalGarbageSentP1 / workerCount,
        garbageReceived: totalGarbageReceivedP1 / workerCount,
      },
      p2: {
        score: totalScoreP2 / workerCount,
        lines: totalLinesP2 / workerCount,
        garbageSent: totalGarbageSentP2 / workerCount,
        garbageReceived: totalGarbageReceivedP2 / workerCount,
      },
    },
  };
}

async function runVersusTrainingLoop(
  projectRoot: string,
  workerPath: string,
): Promise<void> {
  if (versusTrainingController.running) {
    return;
  }
  versusTrainingController.running = true;
  versusTrainingController.stopRequested = false;
  versusTrainingController.status.running = true;

  while (!versusTrainingController.stopRequested) {
    try {
      const baseConfig = await loadVersusWeights(projectRoot);
      const batch = await runVersusTrainingBatch(workerPath, baseConfig);
      await saveVersusWeights(projectRoot, {
        p1: batch.evaluatorConfigP1,
        p2: batch.evaluatorConfigP2,
      });

      versusTrainingController.status.cycle += 1;
      versusTrainingController.status.averageScore = {
        p1: batch.averages.p1.score,
        p2: batch.averages.p2.score,
      };
      versusTrainingController.status.averageLines = {
        p1: batch.averages.p1.lines,
        p2: batch.averages.p2.lines,
      };
      versusTrainingController.status.wins = { ...batch.winCounts };
      const lastSummary =
        batch.summaries[batch.summaries.length - 1] ?? batch.summaries[0];
      versusTrainingController.status.previewBoardP1 = lastSummary?.p1.board ?? [];
      versusTrainingController.status.previewBoardP2 = lastSummary?.p2.board ?? [];
      versusTrainingController.status.updatedAt = new Date().toISOString();
      delete versusTrainingController.status.message;
    } catch (error) {
      versusTrainingController.status.message =
        error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('Versus training batch failed:', error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  versusTrainingController.running = false;
  versusTrainingController.status.running = false;
  versusTrainingController.loopPromise = null;
}

function createServer(
  projectRoot: string,
  workerPath: string,
  versusWorkerPath: string,
) {
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

  app.post('/api/versus/train/start', async (_req, res) => {
    if (versusTrainingController.running) {
      res.json({ status: versusTrainingController.status });
      return;
    }
    versusTrainingController.loopPromise = runVersusTrainingLoop(
      projectRoot,
      versusWorkerPath,
    );
    res.json({ status: versusTrainingController.status });
  });

  app.post('/api/versus/train/stop', (_req, res) => {
    versusTrainingController.stopRequested = true;
    res.json({ status: versusTrainingController.status });
  });

  app.get('/api/versus/train/status', (_req, res) => {
    res.json(versusTrainingController.status);
  });

  app.get('/api/versus/weights', async (_req, res) => {
    try {
      const weights = await loadVersusWeights(projectRoot);
      res.json(weights);
    } catch (error) {
      res
        .status(500)
        .json({ error: 'Failed to load versus weights', details: String(error) });
    }
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
  const versusWorkerPath = path.resolve(
    projectRoot,
    'dist',
    'gui',
    'versus_train_worker.js',
  );
  const app = createServer(projectRoot, workerPath, versusWorkerPath);
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
