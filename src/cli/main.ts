import fs from 'fs';
import path from 'path';

import { TetrisGame } from '../core/game';
import { getAbsoluteCells } from '../core/pieces';
import { Piece } from '../core/types';
import { PatternInferenceAgent } from '../ai/agent';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../ai/evaluator';
import { VersusEnvironment } from '../versus/environment';

type CliMode = 'solo' | 'versus';

interface CliOptions {
  games: number;
  render: boolean;
  renderEvery: number;
  mode: CliMode;
  weightsPath: string;
  weightsP1Path: string;
  weightsP2Path: string;
  maxVersusSteps: number;
}

const CELL_CHARS = [' ', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', '*'];

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const getNumber = (flag: string, fallback: number): number => {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) {
      const value = Number(args[index + 1]);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
    return fallback;
  };
  const getString = (flag: string, fallback: string): string => {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) {
      return args[index + 1] ?? fallback;
    }
    return fallback;
  };
  const hasFlag = (flag: string): boolean => args.includes(flag);
  const modeValue = getString('--mode', 'solo').toLowerCase();
  const mode: CliMode = hasFlag('--versus') || modeValue === 'versus' ? 'versus' : 'solo';
  return {
    games: getNumber('--games', 1),
    render: hasFlag('--render'),
    renderEvery: getNumber('--render-every', 10),
    mode,
    weightsPath: getString('--weights', process.env.WEIGHTS_PATH ?? 'weights.json'),
    weightsP1Path: getString(
      '--weights-p1',
      process.env.WEIGHTS_P1_PATH ?? 'weights_p1.json',
    ),
    weightsP2Path: getString(
      '--weights-p2',
      process.env.WEIGHTS_P2_PATH ?? 'weights_p2.json',
    ),
    maxVersusSteps: getNumber(
      '--versus-max-steps',
      Number(process.env.VERSUS_MAX_STEPS ?? 2000),
    ),
  };
}

function loadEvaluator(weightsPath: string): LinearEvaluator {
  const resolved = path.resolve(process.cwd(), weightsPath);
  if (fs.existsSync(resolved)) {
    try {
      const raw = fs.readFileSync(resolved, 'utf-8');
      const parsed = JSON.parse(raw);
      return new LinearEvaluator({
        weights: parsed.weights ?? DEFAULT_WEIGHTS,
        bias: parsed.bias ?? 0,
        learningRate: Number(process.env.CLI_LEARNING_RATE ?? 0.001),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to load weights from ${resolved}:`, error);
    }
  }
  return new LinearEvaluator({
    weights: DEFAULT_WEIGHTS,
    learningRate: Number(process.env.CLI_LEARNING_RATE ?? 0.001),
  });
}

function renderBoard(game: TetrisGame): string {
  const board = game.getBoard();
  const active = game.getActivePiece();
  const ghostY = game.ghostY();
  const visibleRows: string[] = [];
  const overlay = new Map<string, string>();

  if (active && ghostY !== null) {
    const ghostPiece: Piece = {
      ...active,
      position: { x: active.position.x, y: ghostY },
    };
    for (const cell of getAbsoluteCells(
      ghostPiece.type,
      ghostPiece.rotation,
      ghostPiece.position,
    )) {
      if (cell.y >= board.hiddenRows && board.isInside(cell.x, cell.y)) {
        overlay.set(`${cell.x},${cell.y}`, '+');
      }
    }
  }

  if (active) {
    for (const cell of getAbsoluteCells(
      active.type,
      active.rotation,
      active.position,
    )) {
      if (cell.y >= board.hiddenRows && board.isInside(cell.x, cell.y)) {
        overlay.set(`${cell.x},${cell.y}`, '@');
      }
    }
  }

  const border = `+${'-'.repeat(board.width)}+`;
  visibleRows.push(border);
  for (let y = board.hiddenRows; y < board.height; y += 1) {
    let rowString = '|';
    for (let x = 0; x < board.width; x += 1) {
      const key = `${x},${y}`;
      const overlayChar = overlay.get(key);
      if (overlayChar) {
        rowString += overlayChar;
        continue;
      }
      const cell = board.get(x, y) ?? 0;
      const char = CELL_CHARS[cell] ?? '#';
      rowString += char;
    }
    rowString += '|';
    visibleRows.push(rowString);
  }
  visibleRows.push(border);
  return visibleRows.join('\n');
}

function renderVersusState(environment: VersusEnvironment): string {
  const headerP1 = '--- Player 1 ---';
  const headerP2 = '--- Player 2 ---';
  const boardP1 = renderBoard(environment.getGame(0));
  const boardP2 = renderBoard(environment.getGame(1));
  return `${headerP1}\n${boardP1}\n${headerP2}\n${boardP2}`;
}

function playGame(agent: PatternInferenceAgent, options: CliOptions): void {
  const game = new TetrisGame();
  let steps = 0;
  while (!game.isGameOver()) {
    const outcome = agent.act(game);
    if (!outcome) {
      break;
    }
    steps += 1;
    if (options.render && steps % options.renderEvery === 0) {
      // eslint-disable-next-line no-console
      console.log(renderBoard(game));
      const stats = game.getStats();
      // eslint-disable-next-line no-console
      console.log(
        `Score=${stats.score} Lines=${stats.lines} Combo=${stats.combo} B2B=${stats.backToBack}`,
      );
    }
  }
  const stats = game.getStats();
  // eslint-disable-next-line no-console
  console.log(
    `Game finished: score=${stats.score}, lines=${stats.lines}, level=${stats.level}, pieces=${stats.totalPieces}`,
  );
}

function playVersusGame(
  agentP1: PatternInferenceAgent,
  agentP2: PatternInferenceAgent,
  options: CliOptions,
): void {
  const environment = new VersusEnvironment();
  let stepCounter = 0;
  while (!environment.hasEnded()) {
    const snapshotP1 = environment.getPlayerSnapshot(0);
    const snapshotP2 = environment.getPlayerSnapshot(1);
    if (
      snapshotP1.moves >= options.maxVersusSteps &&
      snapshotP2.moves >= options.maxVersusSteps
    ) {
      break;
    }
    const order: (0 | 1)[] = [0, 1];
    for (const playerIndex of order) {
      const snapshot = environment.getPlayerSnapshot(playerIndex);
      if (snapshot.moves >= options.maxVersusSteps) {
        continue;
      }
      environment.actWithAgent(
        playerIndex,
        playerIndex === 0 ? agentP1 : agentP2,
      );
      stepCounter += 1;
      if (options.render && stepCounter % options.renderEvery === 0) {
        // eslint-disable-next-line no-console
        console.log(renderVersusState(environment));
      }
      if (environment.hasEnded()) {
        break;
      }
    }
  }
  if (options.render) {
    // eslint-disable-next-line no-console
    console.log(renderVersusState(environment));
  }

  const winner = environment.winner();
  const resultLabel =
    winner === null ? 'Draw' : winner === 0 ? 'Player 1 wins' : 'Player 2 wins';
  const statsP1 = environment.getGame(0).getStats();
  const statsP2 = environment.getGame(1).getStats();
  const snapshotP1 = environment.getPlayerSnapshot(0);
  const snapshotP2 = environment.getPlayerSnapshot(1);

  // eslint-disable-next-line no-console
  console.log(`[Versus] ${resultLabel}`);
  // eslint-disable-next-line no-console
  console.log(
    `P1 score=${statsP1.score} lines=${statsP1.lines} garbageSent=${snapshotP1.totalGarbageSent} garbageRecv=${snapshotP1.totalGarbageReceived} moves=${snapshotP1.moves}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `P2 score=${statsP2.score} lines=${statsP2.lines} garbageSent=${snapshotP2.totalGarbageSent} garbageRecv=${snapshotP2.totalGarbageReceived} moves=${snapshotP2.moves}`,
  );
}

function main(): void {
  const options = parseOptions();
  if (options.mode === 'versus') {
    const evaluatorP1 = loadEvaluator(options.weightsP1Path);
    const evaluatorP2 = loadEvaluator(options.weightsP2Path);
    const agentP1 = new PatternInferenceAgent(evaluatorP1, {
      enableHold: true,
      explorationRate: 0,
    });
    const agentP2 = new PatternInferenceAgent(evaluatorP2, {
      enableHold: true,
      explorationRate: 0,
    });
    for (let i = 0; i < options.games; i += 1) {
      if (options.games > 1) {
        // eslint-disable-next-line no-console
        console.log(`\n=== Versus Game ${i + 1}/${options.games} ===`);
      }
      playVersusGame(agentP1, agentP2, options);
    }
    return;
  }

  const evaluator = loadEvaluator(options.weightsPath);
  const agent = new PatternInferenceAgent(evaluator, {
    enableHold: true,
    explorationRate: 0,
  });
  for (let i = 0; i < options.games; i += 1) {
    if (options.games > 1) {
      // eslint-disable-next-line no-console
      console.log(`\n=== Game ${i + 1}/${options.games} ===`);
    }
    playGame(agent, options);
  }
}

main();
