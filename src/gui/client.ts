/* eslint-disable no-console */
import { MatrixBoard } from '../core/board';
import { TetrisGame } from '../core/game';
import { getAbsoluteCells, PIECE_SHAPES, SRS_KICKS, rotate } from '../core/pieces';
import { Piece, PieceType, Rotation } from '../core/types';
import { PatternInferenceAgent, type SimulationOutcome, type AgentOptions } from '../ai/agent';
import { LinearEvaluator, DEFAULT_WEIGHTS } from '../ai/evaluator';

type AutoAction =
  | 'hold'
  | 'move-left'
  | 'move-right'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'rotate-180'
  | 'soft-drop'
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

const TRAIN_STATUS_POLL_INTERVAL = 1500;
const PREVIEW_BACKGROUND = 'rgba(8, 10, 18, 0.95)';
const PREVIEW_GRID_COLOR = 'rgba(255, 255, 255, 0.08)';

interface TrainingStatusDto {
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

function gravityInterval(level: number): number {
  if (level < 1) {
    return LEVEL_GRAVITY_MS[0]!;
  }
  const index = Math.min(level - 1, LEVEL_GRAVITY_MS.length - 1);
  return LEVEL_GRAVITY_MS[index]!;
}

type PieceState = {
  x: number;
  y: number;
  rotation: Rotation;
};

function stateKey(state: PieceState): string {
  return `${state.x},${state.y},${state.rotation}`;
}

function canPlaceState(
  board: MatrixBoard,
  type: PieceType,
  state: PieceState,
): boolean {
  const cells = getAbsoluteCells(type, state.rotation, {
    x: state.x,
    y: state.y,
  });
  for (const cell of cells) {
    if (cell.y < 0) {
      continue;
    }
    if (!board.isInside(cell.x, cell.y)) {
      return false;
    }
    if (board.isOccupied(cell.x, cell.y)) {
      return false;
    }
  }
  return true;
}

function tryRotateState(
  board: MatrixBoard,
  type: PieceType,
  state: PieceState,
  direction: 'cw' | 'ccw' | '180',
): PieceState | null {
  const delta = direction === 'cw' ? 1 : direction === 'ccw' ? -1 : 2;
  const targetRotation = rotate(state.rotation, delta);
  const kicks =
    SRS_KICKS[type]?.[state.rotation]?.[targetRotation] ?? [[0, 0] as [number, number]];
  for (const [dx, dy] of kicks) {
    const candidate: PieceState = {
      rotation: targetRotation,
      x: state.x + dx,
      y: state.y + dy,
    };
    if (canPlaceState(board, type, candidate)) {
      return candidate;
    }
  }
  return null;
}

function generateNeighbors(
  board: MatrixBoard,
  type: PieceType,
  state: PieceState,
): Array<{ action: AutoAction; state: PieceState }> {
  const neighbors: Array<{ action: AutoAction; state: PieceState }> = [];

  const cw = tryRotateState(board, type, state, 'cw');
  if (cw) {
    neighbors.push({ action: 'rotate-cw', state: cw });
  }
  const ccw = tryRotateState(board, type, state, 'ccw');
  if (ccw) {
    neighbors.push({ action: 'rotate-ccw', state: ccw });
  }
  const rot180 = tryRotateState(board, type, state, '180');
  if (rot180) {
    neighbors.push({ action: 'rotate-180', state: rot180 });
  }

  const left: PieceState = { ...state, x: state.x - 1 };
  if (canPlaceState(board, type, left)) {
    neighbors.push({ action: 'move-left', state: left });
  }
  const right: PieceState = { ...state, x: state.x + 1 };
  if (canPlaceState(board, type, right)) {
    neighbors.push({ action: 'move-right', state: right });
  }
  const down: PieceState = { ...state, y: state.y + 1 };
  if (canPlaceState(board, type, down)) {
    neighbors.push({ action: 'soft-drop', state: down });
  }
  return neighbors;
}

function planPathToTarget(
  board: MatrixBoard,
  type: PieceType,
  start: PieceState,
  targetX: number,
  targetRotation: Rotation,
  targetY: number,
): AutoAction[] | null {
  const queue: Array<{ state: PieceState; actions: AutoAction[] }> = [
    { state: start, actions: [] },
  ];
  const visited = new Set<string>([stateKey(start)]);
  const maxIterations = 2000;
  const maxY = Math.max(targetY + 2, start.y + 12);
  let iterations = 0;

  while (queue.length > 0 && iterations < maxIterations) {
    const node = queue.shift()!;
    iterations += 1;

    if (node.state.rotation === targetRotation && node.state.x === targetX) {
      return [...node.actions, 'hard-drop'];
    }

    for (const neighbor of generateNeighbors(board, type, node.state)) {
      if (neighbor.state.y > maxY) {
        continue;
      }
      const key = stateKey(neighbor.state);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({
        state: neighbor.state,
        actions: [...node.actions, neighbor.action],
      });
    }
  }
  return null;
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

function simplePlan(
  current: PieceState,
  targetX: number,
  targetRotation: Rotation,
): AutoAction[] {
  const plan: AutoAction[] = [];
  plan.push(...rotationActions(current.rotation, targetRotation));
  const deltaX = targetX - current.x;
  const moveAction = deltaX > 0 ? 'move-right' : 'move-left';
  for (let i = 0; i < Math.abs(deltaX); i += 1) {
    plan.push(moveAction);
  }
  plan.push('hard-drop');
  return plan;
}

function renderPreviewBoard(canvas: HTMLCanvasElement, board: number[][]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PREVIEW_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = board.length;
  const cols = rows > 0 ? board[0]?.length ?? BOARD_COLUMNS : BOARD_COLUMNS;
  if (rows === 0 || cols === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO DATA', canvas.width / 2, canvas.height / 2);
    return;
  }
  const cellSize = Math.max(
    8,
    Math.floor(Math.min(canvas.width / cols, canvas.height / rows)),
  );
  const offsetX = Math.floor((canvas.width - cellSize * cols) / 2);
  const offsetY = Math.floor((canvas.height - cellSize * rows) / 2);

  for (let y = 0; y < rows; y += 1) {
    const row = board[y];
    if (!row) {
      continue;
    }
    for (let x = 0; x < cols; x += 1) {
      const value = row[x] ?? 0;
      if (value <= 0) {
        continue;
      }
      const type = VALUE_TO_TYPE[value];
      const color = type ? PIECE_COLORS[type] : { fill: '#c5d1ff', stroke: '#97a3c7' };
      const drawX = offsetX + x * cellSize;
      const drawY = offsetY + y * cellSize;
      const gradient = ctx.createLinearGradient(drawX, drawY, drawX, drawY + cellSize);
      gradient.addColorStop(0, color.fill);
      gradient.addColorStop(1, `${color.fill}dd`);
      ctx.fillStyle = gradient;
      ctx.fillRect(drawX, drawY, cellSize, cellSize);
      ctx.strokeStyle = `${color.stroke}cc`;
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX + 0.5, drawY + 0.5, cellSize - 1, cellSize - 1);
    }
  }

  ctx.strokeStyle = PREVIEW_GRID_COLOR;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x += 1) {
    const posX = offsetX + x * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(posX, offsetY);
    ctx.lineTo(posX, offsetY + rows * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    const posY = offsetY + y * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(offsetX, posY);
    ctx.lineTo(offsetX + cols * cellSize, posY);
    ctx.stroke();
  }
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

class TrainingPanel {
  private readonly toggleButton = document.getElementById('btn-train-toggle') as HTMLButtonElement | null;

  private readonly statusLabel = document.getElementById('train-status-label');

  private readonly cycleEl = document.getElementById('train-cycle');

  private readonly avgScoreEl = document.getElementById('train-average-score');

  private readonly avgLinesEl = document.getElementById('train-average-lines');

  private readonly bestScoreEl = document.getElementById('train-best-score');

  private readonly updatedAtEl = document.getElementById('train-updated-at');

  private readonly messageEl = document.getElementById('train-message');

  private readonly previewCanvas = document.getElementById('train-preview') as HTMLCanvasElement | null;

  private pollingId: number | null = null;

  private running = false;

  constructor() {
    this.toggleButton?.addEventListener('click', () => {
      void this.toggle();
    });
    void this.fetchStatus();
    this.startPolling();
  }

  refreshStatus(): void {
    void this.fetchStatus();
  }

  private startPolling(): void {
    if (this.pollingId !== null) {
      return;
    }
    this.pollingId = window.setInterval(() => {
      void this.fetchStatus();
    }, TRAIN_STATUS_POLL_INTERVAL);
  }

  private async fetchStatus(): Promise<void> {
    try {
      const response = await fetch('/api/train/status');
      if (!response.ok) {
        throw new Error(`Status HTTP ${response.status}`);
      }
      const data = (await response.json()) as TrainingStatusDto;
      this.applyStatus(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load training status', error);
      if (this.messageEl) {
        this.messageEl.textContent = 'ステータス取得に失敗しました';
      }
    }
  }

  private applyStatus(status: TrainingStatusDto): void {
    this.running = status.running;
    if (this.toggleButton) {
      this.toggleButton.textContent = status.running ? 'トレーニング停止' : 'トレーニング開始';
    }
    if (this.statusLabel) {
      this.statusLabel.textContent = status.running ? '進行中' : '停止中';
      this.statusLabel.style.color = status.running ? '#5fd9ff' : 'rgba(255,255,255,0.6)';
    }
    if (this.cycleEl) {
      this.cycleEl.textContent = status.cycle.toString();
    }
    if (this.avgScoreEl) {
      this.avgScoreEl.textContent = status.averageScore.toFixed(1);
    }
    if (this.avgLinesEl) {
      this.avgLinesEl.textContent = status.averageLines.toFixed(1);
    }
    if (this.bestScoreEl) {
      this.bestScoreEl.textContent = status.bestScore.toFixed(1);
    }
    if (this.updatedAtEl) {
      this.updatedAtEl.textContent = status.updatedAt
        ? new Date(status.updatedAt).toLocaleTimeString()
        : '-';
    }
    if (this.messageEl) {
      this.messageEl.textContent = status.message ?? '';
    }
    if (this.previewCanvas) {
      renderPreviewBoard(this.previewCanvas, status.previewBoard ?? []);
    }
  }

  private async toggle(): Promise<void> {
    const endpoint = this.running ? '/api/train/stop' : '/api/train/start';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Toggle HTTP ${response.status}`);
      }
      // Response includes latest status
      const data = (await response.json()) as { status?: TrainingStatusDto };
      if (data.status) {
        this.applyStatus(data.status);
      } else {
        await this.fetchStatus();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle training', error);
      if (this.messageEl) {
        this.messageEl.textContent = 'トレーニング制御に失敗しました';
      }
    }
  }
}

class GameApp {
  private game: TetrisGame;

  private readonly renderer: GameRenderer;

  private readonly statDisplay = new StatDisplay();

  private readonly trainingPanel = new TrainingPanel();

  private readonly agentOptions: AgentOptions;

  private readonly agent: PatternInferenceAgent;

  private autoPlayEnabled = false;

  private autoQueue: AutoAction[] = [];

  private pendingDecision: SimulationOutcome | null = null;

  private autoCooldown = 0;

  private gravityTimer = 0;

  private lastFrame = 0;

  private suggestionList: HTMLUListElement | null;

  private latestSuggestions: SimulationOutcome[] = [];

  private suggestionTimer = 0;

  private lastSuggestionSignature: string | null = null;

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
    this.agentOptions = {
      enableHold: true,
      explorationRate: 0,
    };
    this.agent = new PatternInferenceAgent(
      new LinearEvaluator({
        weights: DEFAULT_WEIGHTS,
        learningRate: 0,
      }),
      this.agentOptions,
    );
    this.suggestionList = document.getElementById(
      'suggestion-list',
    ) as HTMLUListElement | null;

    this.bindButtons();
    this.bindInput();
    this.statDisplay.update(this.game);
    this.renderer.render(this.game);
    this.refreshSuggestions(true);

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
    this.maybeRefreshSuggestions(delta);

    requestAnimationFrame(this.tick);
  };

  private applyGravity(delta: number): void {
    this.gravityTimer += delta;
    const interval = gravityInterval(this.game.getStats().level);
    if (this.gravityTimer >= interval) {
      const result = this.game.softDrop();
      this.resetSuggestionTimer();
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
    if (this.autoQueue.length === 0) {
      this.buildAutoPlan();
    }
    if (this.autoQueue.length === 0 || this.autoCooldown > 0) {
      return;
    }
    const action = this.autoQueue.shift();
    if (!action) {
      return;
    }
    let success = false;
    switch (action) {
      case 'hold':
        success = this.game.hold();
        if (success) {
          this.pendingDecision = null;
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
      case 'soft-drop': {
        const dropResult = this.game.softDrop();
        this.gravityTimer = 0;
        success = true;
        if (dropResult) {
          this.autoQueue = [];
          this.pendingDecision = null;
        }
        break;
      }
      case 'hard-drop':
        this.game.hardDrop();
        this.gravityTimer = 0;
        this.autoQueue = [];
        this.pendingDecision = null;
        success = true;
        break;
      default:
        break;
    }
    this.resetSuggestionTimer();
    this.autoCooldown = action === 'hard-drop' ? 90 : 70;
    if (!success) {
      this.autoQueue = [];
      this.pendingDecision = null;
    }
  }

  private buildAutoPlan(): void {
    const ranked = this.agent.evaluateCandidates(this.game);
    this.refreshSuggestions(true, ranked);
    if (ranked.length === 0) {
      this.autoQueue = [];
      this.pendingDecision = null;
      return;
    }
    const explorationRate = this.agentOptions.explorationRate ?? 0;
    let selected = ranked[0]!;
    if (explorationRate > 0 && Math.random() < explorationRate) {
      const index = Math.floor(Math.random() * ranked.length);
      selected = ranked[index] ?? selected;
    }
    this.pendingDecision = selected;
    this.autoQueue = this.createActionPlan(selected);
  }

  private createActionPlan(outcome: SimulationOutcome): AutoAction[] {
    if (outcome.candidate.useHold) {
      const simulation = this.game.clone();
      if (!simulation.hold()) {
        return ['hard-drop'];
      }
      const postHoldPlan = this.planForActivePiece(simulation, outcome.candidate);
      return ['hold', ...postHoldPlan];
    }
    const simulation = this.game.clone();
    return this.planForActivePiece(simulation, outcome.candidate);
  }

  private planForActivePiece(
    gameState: TetrisGame,
    candidate: SimulationOutcome['candidate'],
  ): AutoAction[] {
    const active = gameState.getActivePiece();
    if (!active) {
      return ['hard-drop'];
    }
    const board = gameState.getBoard();
    const start: PieceState = {
      x: active.position.x,
      y: active.position.y,
      rotation: active.rotation,
    };
    const planned = planPathToTarget(
      board,
      candidate.type,
      start,
      candidate.x,
      candidate.rotation,
      candidate.y,
    );
    if (planned) {
      return planned;
    }
    console.warn('Falling back to simple plan for candidate', candidate);
    return simplePlan(start, candidate.x, candidate.rotation);
  }

  private refreshSuggestions(
    force = false,
    precomputed?: SimulationOutcome[],
  ): void {
    if (!this.suggestionList) {
      return;
    }
    const status = this.game.getStatus();
    const active = status.activePiece;
    if (!active) {
      this.renderSuggestions([]);
      this.lastSuggestionSignature = null;
      return;
    }
    const signature = [
      active.type,
      active.rotation,
      active.position.x,
      active.position.y,
      status.holdPiece ?? 'none',
      status.nextQueue.slice(0, 3).join(','),
      status.stats.totalPieces,
    ].join(':');

    if (!force && signature === this.lastSuggestionSignature) {
      return;
    }

    const outcomes = precomputed ?? this.agent.evaluateCandidates(this.game);
    this.lastSuggestionSignature = signature;
    this.latestSuggestions = outcomes.slice(0, 3);
    this.renderSuggestions(this.latestSuggestions);
  }

  private renderSuggestions(outcomes: SimulationOutcome[]): void {
    if (!this.suggestionList) {
      return;
    }
    this.suggestionList.innerHTML = '';
    if (outcomes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'suggestion-list__item suggestion-list__item--empty';
      empty.textContent = this.game.isGameOver() ? 'ゲーム終了' : '推論中...';
      this.suggestionList.appendChild(empty);
      return;
    }
    outcomes.forEach((outcome, index) => {
      const item = document.createElement('li');
      item.className = 'suggestion-list__item';
      const { candidate } = outcome;
      const holdLabel = candidate.useHold ? ' (Hold)' : '';
      item.innerHTML = `<div>#${index + 1} <strong>${candidate.type}${holdLabel}</strong></div>
        <div>score: <strong>${outcome.evaluation.toFixed(2)}</strong></div>
        <div>x=${candidate.x} y=${candidate.y} rot=${candidate.rotation}</div>`;
      this.suggestionList.appendChild(item);
    });
  }

  private maybeRefreshSuggestions(delta: number): void {
    this.suggestionTimer = Math.max(0, this.suggestionTimer - delta);
    if (this.suggestionTimer <= 0) {
      this.suggestionTimer = 200;
      this.refreshSuggestions();
    }
  }

  private resetSuggestionTimer(): void {
    this.suggestionTimer = 0;
    this.lastSuggestionSignature = null;
  }

  private handleSoftDrop(): void {
    const result = this.game.softDrop();
    this.gravityTimer = 0;
    this.resetSuggestionTimer();
    if (result) {
      this.autoQueue = [];
      this.pendingDecision = null;
    }
    this.onManualAction();
  }

  private handleHardDrop(): void {
    this.game.hardDrop();
    this.gravityTimer = 0;
    this.resetSuggestionTimer();
    this.autoQueue = [];
    this.pendingDecision = null;
    this.onManualAction();
  }

  private onManualAction(): void {
    if (this.autoPlayEnabled) {
      this.toggleAutoPlay(false);
    } else {
      this.refreshSuggestions(true);
    }
  }

  private toggleAutoPlay(force?: boolean): void {
    const previous = this.autoPlayEnabled;
    if (typeof force === 'boolean') {
      this.autoPlayEnabled = force;
    } else {
      this.autoPlayEnabled = !this.autoPlayEnabled;
    }
    const toggleAuto = document.getElementById('btn-toggle-auto');
    if (toggleAuto) {
      toggleAuto.textContent = this.autoPlayEnabled ? 'オート: ON' : 'オート: OFF';
    }
    if (previous === this.autoPlayEnabled && force !== undefined) {
      return;
    }
    this.autoQueue = [];
    this.pendingDecision = null;
    this.resetSuggestionTimer();
    this.autoCooldown = 0;
    if (this.autoPlayEnabled) {
      this.buildAutoPlan();
    } else {
      this.refreshSuggestions(true);
    }
  }

  private resetGame(): void {
    this.game = new TetrisGame();
    this.autoQueue = [];
    this.pendingDecision = null;
    this.gravityTimer = 0;
    this.lastFrame = 0;
    this.autoPlayEnabled = false;
    this.autoCooldown = 0;
    const toggleAuto = document.getElementById('btn-toggle-auto');
    if (toggleAuto) {
      toggleAuto.textContent = 'オート: OFF';
    }
    this.resetSuggestionTimer();
    this.refreshSuggestions(true);
    this.statDisplay.update(this.game);
    this.renderer.render(this.game);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    new GameApp();
  } catch (error) {
    console.error(error);
  }
});
