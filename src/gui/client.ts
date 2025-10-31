/* eslint-disable no-console */
import { TetrisGame } from '../core/game';
import { getAbsoluteCells, PIECE_SHAPES } from '../core/pieces';
import { Piece, PieceType, Rotation } from '../core/types';
import { PatternInferenceAgent } from '../ai/agent';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../ai/evaluator';

type AutoAction =
  | 'hold'
  | 'move-left'
  | 'move-right'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'rotate-180'
  | 'hard-drop';

const VALUE_TO_TYPE: Record<number, PieceType> = {
  1: 'I',
  2: 'O',
  3: 'T',
  4: 'S',
  5: 'Z',
  6: 'J',
  7: 'L',
};

const PIECE_COLORS: Record<PieceType, { fill: string; stroke: string }> = {
  I: { fill: '#30dff2', stroke: '#0aa6d1' },
  O: { fill: '#f9ea5d', stroke: '#e3c400' },
  T: { fill: '#b565ff', stroke: '#7828d4' },
  S: { fill: '#7cff7c', stroke: '#32d132' },
  Z: { fill: '#ff6b6b', stroke: '#d83030' },
  J: { fill: '#5d8bff', stroke: '#1b46d1' },
  L: { fill: '#ffb35c', stroke: '#d67900' },
};

const GHOST_COLOR = 'rgba(255, 255, 255, 0.18)';
const GRID_COLOR = 'rgba(255, 255, 255, 0.05)';
const LOCKED_STROKE_ALPHA = 0.35;
const BOARD_COLUMNS = 10;
const VISIBLE_ROWS = 20;

const LEVEL_GRAVITY_MS: number[] = [
  1000, 793, 618, 473, 355, 262, 190, 135, 94, 64, 43, 28, 18, 11, 7, 5, 4, 3, 2, 1.5,
];

function gravityInterval(level: number): number {
  if (level < 1) {
    return LEVEL_GRAVITY_MS[0]!;
  }
  const index = Math.min(level - 1, LEVEL_GRAVITY_MS.length - 1);
  return LEVEL_GRAVITY_MS[index]!;
}

function rotationActions(from: Rotation, to: Rotation): AutoAction[] {
  const diff = ((to - from) % 4 + 4) % 4;
  if (diff === 0) {
    return [];
  }
  if (diff === 1) {
    return ['rotate-cw'];
  }
  if (diff === 2) {
    return ['rotate-180'];
  }
  return ['rotate-ccw'];
}

class GameRenderer {
  private readonly boardCtx: CanvasRenderingContext2D;

  private readonly holdCtx: CanvasRenderingContext2D;

  private readonly queueCtx: CanvasRenderingContext2D;

  private readonly cellSize: number;

  constructor(
    private readonly boardCanvas: HTMLCanvasElement,
    private readonly holdCanvas: HTMLCanvasElement,
    private readonly queueCanvas: HTMLCanvasElement,
  ) {
    const boardContext = boardCanvas.getContext('2d');
    const holdContext = holdCanvas.getContext('2d');
    const queueContext = queueCanvas.getContext('2d');
    if (!boardContext || !holdContext || !queueContext) {
      throw new Error('Unable to initialise canvas contexts');
    }
    this.boardCtx = boardContext;
    this.holdCtx = holdContext;
    this.queueCtx = queueContext;
    this.cellSize = Math.floor(
      Math.min(
        boardCanvas.width / BOARD_COLUMNS,
        boardCanvas.height / VISIBLE_ROWS,
      ),
    );
  }

  render(game: TetrisGame): void {
    this.drawBoard(game);
    this.drawHold(game);
    this.drawQueue(game);
  }

  private drawBoard(game: TetrisGame): void {
    const ctx = this.boardCtx;
    const board = game.getBoard();
    const active = game.getActivePiece();
    const ghostY = game.ghostY();
    const cellSize = this.cellSize;
    const offsetY = cellSize * (VISIBLE_ROWS - (board.height - board.hiddenRows));
    ctx.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);

    ctx.fillStyle = 'rgba(12, 15, 24, 0.9)';
    ctx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);

    // draw ghost first
    if (active && ghostY !== null) {
      const ghostPiece: Piece = {
        ...active,
        position: { x: active.position.x, y: ghostY },
      };
      ctx.fillStyle = GHOST_COLOR;
      for (const cell of getAbsoluteCells(
        ghostPiece.type,
        ghostPiece.rotation,
        ghostPiece.position,
      )) {
        if (cell.y < board.hiddenRows) {
          continue;
        }
        const drawY = cell.y - board.hiddenRows;
        ctx.fillRect(
          cell.x * cellSize,
          drawY * cellSize - offsetY,
          cellSize,
          cellSize,
        );
      }
    }

    // draw locked blocks and active
    for (let y = board.hiddenRows; y < board.height; y += 1) {
      const drawY = y - board.hiddenRows;
      for (let x = 0; x < board.width; x += 1) {
        const value = board.get(x, y) ?? 0;
        if (value > 0) {
          const pieceType = VALUE_TO_TYPE[value];
          if (pieceType) {
            this.drawCell(ctx, x, drawY, pieceType, false);
          } else {
            ctx.fillStyle = '#444';
            ctx.fillRect(
              x * cellSize,
              drawY * cellSize - offsetY,
              cellSize,
              cellSize,
            );
          }
        }
      }
    }

    if (active) {
      for (const cell of getAbsoluteCells(
        active.type,
        active.rotation,
        active.position,
      )) {
        if (cell.y < board.hiddenRows) {
          continue;
        }
        const drawY = cell.y - board.hiddenRows;
        this.drawCell(ctx, cell.x, drawY, active.type, true);
      }
    }

    // grid overlay
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x <= BOARD_COLUMNS; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, VISIBLE_ROWS * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= VISIBLE_ROWS; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(BOARD_COLUMNS * cellSize, y * cellSize + 0.5);
      ctx.stroke();
    }

    if (game.isGameOver()) {
      this.drawGameOverOverlay();
    }
  }

  private drawCell(
    ctx: CanvasRenderingContext2D,
    gridX: number,
    gridY: number,
    type: PieceType,
    isActive: boolean,
  ): void {
    const cellSize = this.cellSize;
    const { fill, stroke } = PIECE_COLORS[type];
    const x = gridX * cellSize;
    const y = gridY * cellSize;

    const gradient = ctx.createLinearGradient(x, y, x, y + cellSize);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, `${fill}dd`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = isActive
      ? stroke
      : `${stroke}${Math.floor(LOCKED_STROKE_ALPHA * 255)
          .toString(16)
          .padStart(2, '0')}`;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  }

  private drawHold(game: TetrisGame): void {
    const ctx = this.holdCtx;
    const canvas = this.holdCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const holdPiece = game.getHoldPiece();
    if (holdPiece) {
      this.drawPreviewPiece(ctx, holdPiece, canvas);
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(16.5, 16.5, canvas.width - 33, canvas.height - 33);
    }
  }

  private drawQueue(game: TetrisGame): void {
    const ctx = this.queueCtx;
    const canvas = this.queueCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const queue = game.getNextQueue().slice(0, 5);
    queue.forEach((piece, index) => {
      ctx.save();
      ctx.translate(canvas.width / 2, 32 + index * 56);
      this.drawPreviewPieceCentered(ctx, piece);
      ctx.restore();
    });
  }

  private drawPreviewPiece(
    ctx: CanvasRenderingContext2D,
    piece: PieceType,
    canvas: HTMLCanvasElement,
  ): void {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    this.drawPreviewPieceCentered(ctx, piece);
    ctx.restore();
  }

  private drawPreviewPieceCentered(
    ctx: CanvasRenderingContext2D,
    piece: PieceType,
  ): void {
    const shape = PIECE_SHAPES[piece][0];
    const cell = 22;
    const { fill, stroke } = PIECE_COLORS[piece];
    const xs = shape.map(([dx]) => dx);
    const ys = shape.map(([_, dy]) => dy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const offsetX = -((width * cell) / 2);
    const offsetY = -((height * cell) / 2);

    for (const [dx, dy] of shape) {
      const x = offsetX + (dx - minX) * cell;
      const y = offsetY + (dy - minY) * cell;
      const gradient = ctx.createLinearGradient(x, y, x, y + cell);
      gradient.addColorStop(0, fill);
      gradient.addColorStop(1, `${fill}dd`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  private drawGameOverOverlay(): void {
    const ctx = this.boardCtx;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 18, 0.85)';
    ctx.fillRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    ctx.fillStyle = '#f4f6ff';
    ctx.font = '20px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      'GAME OVER',
      this.boardCanvas.width / 2,
      this.boardCanvas.height / 2,
    );
    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.fillStyle = '#5fd9ff';
    ctx.fillText(
      'Press R to restart',
      this.boardCanvas.width / 2,
      this.boardCanvas.height / 2 + 28,
    );
    ctx.restore();
  }
}

class StatDisplay {
  private readonly scoreEl = document.getElementById('stat-score');

  private readonly linesEl = document.getElementById('stat-lines');

  private readonly levelEl = document.getElementById('stat-level');

  private readonly comboEl = document.getElementById('stat-combo');

  private readonly b2bEl = document.getElementById('stat-b2b');

  update(game: TetrisGame): void {
    const stats = game.getStats();
    if (this.scoreEl) {
      this.scoreEl.textContent = stats.score.toLocaleString();
    }
    if (this.linesEl) {
      this.linesEl.textContent = stats.lines.toString();
    }
    if (this.levelEl) {
      this.levelEl.textContent = stats.level.toString();
    }
    if (this.comboEl) {
      this.comboEl.textContent = Math.max(stats.combo, 0).toString();
    }
    if (this.b2bEl) {
      this.b2bEl.textContent = stats.backToBack ? 'ON' : 'OFF';
      this.b2bEl.classList.toggle('hud__b2b--active', stats.backToBack);
    }
  }
}

class GameApp {
  private game: TetrisGame;

  private readonly renderer: GameRenderer;

  private readonly statDisplay = new StatDisplay();

  private readonly agent: PatternInferenceAgent;

  private autoPlayEnabled = false;

  private autoQueue: AutoAction[] = [];

  private pendingDecision: ReturnType<PatternInferenceAgent['decide']> = null;

  private autoCooldown = 0;

  private gravityTimer = 0;

  private lastFrame = 0;

  constructor() {
    const boardCanvas = document.getElementById(
      'board-canvas',
    ) as HTMLCanvasElement | null;
    const holdCanvas = document.getElementById(
      'hold-canvas',
    ) as HTMLCanvasElement | null;
    const queueCanvas = document.getElementById(
      'queue-canvas',
    ) as HTMLCanvasElement | null;
    if (!boardCanvas || !holdCanvas || !queueCanvas) {
      throw new Error('Missing canvas elements');
    }

    this.game = new TetrisGame();
    this.renderer = new GameRenderer(boardCanvas, holdCanvas, queueCanvas);
    this.agent = new PatternInferenceAgent(
      new LinearEvaluator({
        weights: DEFAULT_WEIGHTS,
        learningRate: 0,
      }),
      {
        enableHold: true,
        explorationRate: 0,
      },
    );

    this.bindButtons();
    this.bindInput();
    this.statDisplay.update(this.game);
    this.renderer.render(this.game);

    requestAnimationFrame(this.tick);
  }

  private bindButtons(): void {
    const toggleAuto = document.getElementById('btn-toggle-auto');
    const resetButton = document.getElementById('btn-reset');
    toggleAuto?.addEventListener('click', () => this.toggleAutoPlay());
    resetButton?.addEventListener('click', () => this.resetGame());
  }

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      if (event.target && event.target instanceof HTMLInputElement) {
        return;
      }
      switch (event.code) {
        case 'ArrowLeft':
          if (this.game.move(-1)) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'ArrowRight':
          if (this.game.move(1)) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'ArrowDown':
          this.handleSoftDrop();
          event.preventDefault();
          break;
        case 'ArrowUp':
        case 'KeyX':
        case 'KeyS':
          if (this.game.rotate('cw')) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'KeyZ':
        case 'KeyA':
          if (this.game.rotate('ccw')) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'KeyQ':
          if (this.game.rotate('180')) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'Space':
          this.handleHardDrop();
          event.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyC':
          if (this.game.hold()) {
            this.onManualAction();
          }
          event.preventDefault();
          break;
        case 'KeyP':
          this.toggleAutoPlay();
          event.preventDefault();
          break;
        case 'KeyR':
          this.resetGame();
          event.preventDefault();
          break;
        default:
          break;
      }
    });
  }

  private tick = (timestamp: number): void => {
    if (this.lastFrame === 0) {
      this.lastFrame = timestamp;
    }
    const delta = timestamp - this.lastFrame;
    this.lastFrame = timestamp;

    if (!this.game.isGameOver()) {
      this.applyGravity(delta);
      if (this.autoPlayEnabled) {
        this.processAuto(delta);
      }
    }

    this.renderer.render(this.game);
    this.statDisplay.update(this.game);

    requestAnimationFrame(this.tick);
  };

  private applyGravity(delta: number): void {
    this.gravityTimer += delta;
    const interval = gravityInterval(this.game.getStats().level);
    if (this.gravityTimer >= interval) {
      const result = this.game.softDrop();
      if (result) {
        this.gravityTimer = 0;
        this.autoQueue = [];
        this.pendingDecision = null;
      } else {
        this.gravityTimer -= interval;
      }
    }
  }

  private processAuto(delta: number): void {
    if (this.game.isGameOver()) {
      return;
    }
    this.autoCooldown = Math.max(0, this.autoCooldown - delta);
    if (this.autoCooldown > 0) {
      return;
    }
    if (this.autoQueue.length === 0) {
      this.buildAutoPlan();
      if (this.autoQueue.length === 0) {
        return;
      }
    }
    const action = this.autoQueue.shift();
    if (!action) {
      return;
    }
    let success = false;
    switch (action) {
      case 'hold':
        success = this.game.hold();
        if (success && this.pendingDecision) {
          this.extendActionsForPlacement(this.pendingDecision);
        }
        break;
      case 'move-left':
        success = this.game.move(-1);
        break;
      case 'move-right':
        success = this.game.move(1);
        break;
      case 'rotate-cw':
        success = this.game.rotate('cw');
        break;
      case 'rotate-ccw':
        success = this.game.rotate('ccw');
        break;
      case 'rotate-180':
        success = this.game.rotate('180');
        break;
      case 'hard-drop':
        this.handleHardDrop();
        success = true;
        this.autoQueue = [];
        break;
      default:
        break;
    }
    this.autoCooldown = action === 'hard-drop' ? 120 : 80;
    if (!success && action !== 'hard-drop') {
      // rebuild plan if we failed (board changed unexpectedly)
      this.autoQueue = [];
      this.pendingDecision = null;
    }
  }

  private buildAutoPlan(): void {
    const decision = this.agent.decide(this.game);
    if (!decision) {
      return;
    }
    this.pendingDecision = decision;
    this.autoQueue = [];
    if (decision.candidate.useHold) {
      this.autoQueue.push('hold');
    } else {
      this.extendActionsForPlacement(decision);
    }
  }

  private extendActionsForPlacement(
    decision: NonNullable<typeof this.pendingDecision>,
  ): void {
    const active = this.game.getActivePiece();
    if (!active) {
      return;
    }
    const targetRotation = decision.candidate.rotation;
    const targetX = decision.candidate.x;
    const rotationSequence = rotationActions(active.rotation, targetRotation);
    this.autoQueue.push(...rotationSequence);

    const deltaX = targetX - active.position.x;
    const moveAction = deltaX > 0 ? 'move-right' : 'move-left';
    for (let i = 0; i < Math.abs(deltaX); i += 1) {
      this.autoQueue.push(moveAction);
    }
    this.autoQueue.push('hard-drop');
  }

  private handleSoftDrop(): void {
    const result = this.game.softDrop();
    this.gravityTimer = 0;
    if (result) {
      this.autoQueue = [];
      this.pendingDecision = null;
    }
    this.onManualAction();
  }

  private handleHardDrop(): void {
    this.game.hardDrop();
    this.gravityTimer = 0;
    this.autoQueue = [];
    this.pendingDecision = null;
    this.onManualAction();
  }

  private onManualAction(): void {
    if (this.autoPlayEnabled) {
      this.toggleAutoPlay(false);
    }
  }

  private toggleAutoPlay(force?: boolean): void {
    if (typeof force === 'boolean') {
      this.autoPlayEnabled = force;
    } else {
      this.autoPlayEnabled = !this.autoPlayEnabled;
    }
    const toggleAuto = document.getElementById('btn-toggle-auto');
    if (toggleAuto) {
      toggleAuto.textContent = this.autoPlayEnabled ? 'オート: ON' : 'オート: OFF';
    }
    if (this.autoPlayEnabled) {
      this.autoQueue = [];
      this.pendingDecision = null;
    }
  }

  private resetGame(): void {
    this.game = new TetrisGame();
    this.autoQueue = [];
    this.pendingDecision = null;
    this.gravityTimer = 0;
    this.lastFrame = 0;
    this.toggleAutoPlay(false);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    new GameApp();
  } catch (error) {
    console.error(error);
  }
});
