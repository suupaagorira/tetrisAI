import express from 'express';
import fs from 'fs';
import path from 'path';
import { build, context, type BuildOptions } from 'esbuild';

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function bundleClient(projectRoot: string, watch = false): Promise<void> {
  const entryFile = path.resolve(projectRoot, 'src', 'gui', 'client.ts');
  const outDir = path.resolve(projectRoot, 'dist', 'gui');
  await ensureDir(outDir);
  const options: BuildOptions = {
    entryPoints: [entryFile],
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
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
  } else {
    await build(options);
  }
}

function createServer(projectRoot: string) {
  const app = express();
  const publicDir = path.resolve(projectRoot, 'public');
  const assetsDir = path.resolve(projectRoot, 'dist', 'gui');

  app.use('/assets', express.static(assetsDir, { fallthrough: true }));
  app.use(express.static(publicDir, { fallthrough: true }));

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
  const app = createServer(projectRoot);
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
