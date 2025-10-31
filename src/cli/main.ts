import fs from 'fs';
import path from 'path';

import { TetrisGame } from '../core/game';
import { getAbsoluteCells } from '../core/pieces';
import { Piece } from '../core/types';
import { PatternInferenceAgent } from '../ai/agent';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../ai/evaluator';

interface CliOptions {
  games: number;
  render: boolean;
  renderEvery: number;
  weightsPath: string;
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
  const hasFlag = (flag: string): boolean => args.includes(flag);
  return {
    games: getNumber('--games', 1),
    render: hasFlag('--render'),
    renderEvery: getNumber('--render-every', 10),
    weightsPath: process.env.WEIGHTS_PATH ?? 'weights.json',
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

function main(): void {
  const options = parseOptions();
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
