/* eslint-disable no-console */
import { PatternInferenceAgent } from '../ai/agent';
import { DEFAULT_WEIGHTS, EvaluatorConfig, LinearEvaluator } from '../ai/evaluator';
import { getAbsoluteCells } from '../core/pieces';
import { Piece, PieceType } from '../core/types';
import { TetrisGame } from '../core/game';
import {
  VersusEnvironment,
  VersusPlayerSnapshot,
  VersusStepResult,
} from '../versus/environment';

const BOARD_COLUMNS = 10;
const VISIBLE_ROWS = 20;

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

const GARBAGE_COLOR = '#4d5368';
const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const GHOST_COLOR = 'rgba(255, 255, 255, 0.18)';

type SpeedPreset = {
  value: number;
  label: string;
  interval: number;
};

const SPEED_PRESETS: SpeedPreset[] = [
  { value: 1, label: '超スロー', interval: 700 },
  { value: 2, label: 'スロー', interval: 420 },
  { value: 3, label: '標準', interval: 220 },
  { value: 4, label: 'ハイスピード', interval: 140 },
  { value: 5, label: '最速', interval: 80 },
];

function getSpeedPreset(value: number): SpeedPreset {
  return SPEED_PRESETS.find((preset) => preset.value === value) ?? SPEED_PRESETS[2]!;
}

interface VersusTrainingStatusDto {
  running: boolean;
  cycle: number;
  episodesPerBatch: number;
  averageScore: { p1: number; p2: number };
  averageLines: { p1: number; p2: number };
  wins: { p1: number; p2: number; ties: number };
  previewBoardP1: number[][];
  previewBoardP2: number[][];
  updatedAt: string | null;
  message?: string;
}

interface VersusTrainingElements {
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  statusLabel: HTMLElement;
  cycleLabel: HTMLElement;
  avgScoreP1: HTMLElement;
  avgScoreP2: HTMLElement;
  avgLinesP1: HTMLElement;
  avgLinesP2: HTMLElement;
  winsLabel: HTMLElement;
  updatedAtLabel: HTMLElement;
  messageLabel: HTMLElement;
  previewCanvasP1: HTMLCanvasElement;
  previewCanvasP2: HTMLCanvasElement;
}

function formatStat(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

function drawPreviewMatrix(canvas: HTMLCanvasElement, matrix: number[][]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(12, 15, 24, 0.9)';
  ctx.fillRect(0, 0, width, height);

  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0]?.length ?? BOARD_COLUMNS : BOARD_COLUMNS;
  if (rows === 0 || cols === 0) {
    return;
  }
  const cellSize = Math.min(width / cols, height / rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const value = matrix[y]?.[x] ?? 0;
      if (value === 0) {
        continue;
      }
      const pieceType = VALUE_TO_TYPE[value];
      if (pieceType) {
        const { fill } = PIECE_COLORS[pieceType];
        ctx.fillStyle = fill;
      } else {
        ctx.fillStyle = GARBAGE_COLOR;
      }
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x += 1) {
    const posX = x * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, rows * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    const posY = y * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, posY);
    ctx.lineTo(cols * cellSize, posY);
    ctx.stroke();
  }
}

function createAgentsFromWeights(weights: {
  p1: EvaluatorConfig;
  p2: EvaluatorConfig;
}): [PatternInferenceAgent, PatternInferenceAgent] {
  const evaluatorP1 = new LinearEvaluator(weights.p1);
  const evaluatorP2 = new LinearEvaluator(weights.p2);
  const agentP1 = new PatternInferenceAgent(evaluatorP1, {
    enableHold: true,
    explorationRate: 0,
  });
  const agentP2 = new PatternInferenceAgent(evaluatorP2, {
    enableHold: true,
    explorationRate: 0,
  });
  return [agentP1, agentP2];
}

class VersusBoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;

  private readonly cellSize: number;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to initialise board canvas');
    }
    this.ctx = context;
    this.cellSize = Math.floor(
      Math.min(canvas.width / BOARD_COLUMNS, canvas.height / VISIBLE_ROWS),
    );
  }

  render(game: TetrisGame): void {
    const ctx = this.ctx;
    const board = game.getBoard();
    const active = game.getActivePiece();
    const ghostY = game.ghostY();
    const cellSize = this.cellSize;
    const offsetY = cellSize * (VISIBLE_ROWS - (board.height - board.hiddenRows));

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(12, 15, 24, 0.92)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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

    for (let y = board.hiddenRows; y < board.height; y += 1) {
      const drawY = y - board.hiddenRows;
      for (let x = 0; x < board.width; x += 1) {
        const cellValue = board.get(x, y) ?? 0;
        if (cellValue === 0) {
          continue;
        }
        const pieceType = VALUE_TO_TYPE[cellValue];
        if (pieceType) {
          this.drawCell(x, drawY, pieceType, false);
        } else {
          ctx.fillStyle = GARBAGE_COLOR;
          ctx.fillRect(
            x * cellSize,
            drawY * cellSize - offsetY,
            cellSize,
            cellSize,
          );
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
        this.drawCell(cell.x, drawY, active.type, true);
      }
    }

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
      this.drawOverlayText('TOP OUT');
    }
  }

  private drawCell(
    gridX: number,
    gridY: number,
    type: PieceType,
    isActive: boolean,
  ): void {
    const cellSize = this.cellSize;
    const ctx = this.ctx;
    const { fill, stroke } = PIECE_COLORS[type];
    const x = gridX * cellSize;
    const y = gridY * cellSize;

    const gradient = ctx.createLinearGradient(x, y, x, y + cellSize);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, `${fill}dd`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cellSize, cellSize);

    ctx.strokeStyle = isActive ? stroke : `${stroke}88`;
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  }

  private drawOverlayText(text: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 16, 26, 0.78)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#f4f6ff';
    ctx.font = 'bold 28px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
    ctx.restore();
  }
}

type PlayerPanelState = 'idle' | 'active' | 'winner' | 'loser' | 'draw';

class PlayerPanel {
  private readonly renderer: VersusBoardRenderer;

  private readonly scoreEl: HTMLElement;

  private readonly linesEl: HTMLElement;

  private readonly garbageSentEl: HTMLElement;

  private readonly incomingEl: HTMLElement;

  private readonly garbageRecvEl: HTMLElement;

  private readonly movesEl: HTMLElement;

  private readonly statusEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly prefix: 'p1' | 'p2',
  ) {
    const canvas = root.querySelector<HTMLCanvasElement>('.versus-board');
    if (!canvas) {
      throw new Error(`Missing canvas for ${prefix}`);
    }
    this.renderer = new VersusBoardRenderer(canvas);
    const resolve = (id: string): HTMLElement => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Missing element ${id}`);
      }
      return element;
    };
    this.scoreEl = resolve(`versus-${prefix}-score`);
    this.linesEl = resolve(`versus-${prefix}-lines`);
    this.garbageSentEl = resolve(`versus-${prefix}-garbage-sent`);
    this.incomingEl = resolve(`versus-${prefix}-incoming`);
    this.garbageRecvEl = resolve(`versus-${prefix}-garbage-recv`);
    this.movesEl = resolve(`versus-${prefix}-moves`);
    this.statusEl = resolve(`versus-${prefix}-status`);
  }

  render(game: TetrisGame): void {
    this.renderer.render(game);
  }

  updateStats(snapshot: VersusPlayerSnapshot): void {
    const stats = snapshot.stats;
    this.scoreEl.textContent = stats.score.toLocaleString('ja-JP');
    this.linesEl.textContent = stats.lines.toString();
    this.garbageSentEl.textContent = snapshot.totalGarbageSent.toString();
    this.incomingEl.textContent = snapshot.incomingGarbage.toString();
    this.garbageRecvEl.textContent = snapshot.totalGarbageReceived.toString();
    this.movesEl.textContent = snapshot.moves.toString();
  }

  setStatus(message: string): void {
    this.statusEl.textContent = message;
  }

  markState(state: PlayerPanelState): void {
    this.root.classList.remove(
      'versus-player--active',
      'versus-player--winner',
      'versus-player--loser',
    );
    if (state === 'active') {
      this.root.classList.add('versus-player--active');
    } else if (state === 'winner') {
      this.root.classList.add('versus-player--winner');
    } else if (state === 'loser') {
      this.root.classList.add('versus-player--loser');
    }
  }
}

type LogVariant = 'info' | 'attack' | 'defence';

class VersusLog {
  private readonly listEl: HTMLElement;

  private readonly maxItems: number;

  constructor(listEl: HTMLElement, maxItems = 60) {
    this.listEl = listEl;
    this.maxItems = maxItems;
  }

  push(message: string, variant: LogVariant = 'info'): void {
    const item = document.createElement('li');
    item.className = `versus-log__item versus-log__item--${variant}`;
    item.textContent = message;
    this.listEl.appendChild(item);
    while (this.listEl.children.length > this.maxItems) {
      this.listEl.removeChild(this.listEl.firstChild as ChildNode);
    }
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  clear(): void {
    this.listEl.innerHTML = '';
  }
}

class VersusTrainingClient {
  private pollTimer: number | null = null;

  private lastUpdateToken: string | null = null;

  private readonly pollInterval = 2000;

  constructor(
    private readonly elements: VersusTrainingElements,
    private readonly onWeightsUpdated: () => Promise<void>,
  ) {
    this.attachListeners();
  }

  start(): void {
    void this.fetchAndRender();
    this.startPolling();
  }

  private attachListeners(): void {
    const { startButton, stopButton, reloadButton } = this.elements;
    startButton.addEventListener('click', () => {
      void this.startTraining();
    });
    stopButton.addEventListener('click', () => {
      void this.stopTraining();
    });
    reloadButton.addEventListener('click', () => {
      void this.reloadWeights();
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      void this.fetchAndRender();
    }, this.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async startTraining(): Promise<void> {
    const { startButton } = this.elements;
    startButton.disabled = true;
    try {
      await fetch('/api/versus/train/start', { method: 'POST' });
      await this.fetchAndRender();
    } catch (error) {
      console.error(error);
      this.elements.messageLabel.textContent = 'トレーニング開始に失敗しました。';
    }
  }

  private async stopTraining(): Promise<void> {
    const { stopButton } = this.elements;
    stopButton.disabled = true;
    try {
      await fetch('/api/versus/train/stop', { method: 'POST' });
      await this.fetchAndRender();
    } catch (error) {
      console.error(error);
      this.elements.messageLabel.textContent = 'トレーニング停止に失敗しました。';
    }
  }

  private async reloadWeights(): Promise<void> {
    const { reloadButton } = this.elements;
    reloadButton.disabled = true;
    try {
      await this.onWeightsUpdated();
      this.elements.messageLabel.textContent = 'ウェイトを再読込しました。';
    } catch (error) {
      console.error(error);
      this.elements.messageLabel.textContent = 'ウェイトの再読込に失敗しました。';
    } finally {
      reloadButton.disabled = false;
    }
  }

  private async fetchAndRender(): Promise<void> {
    try {
      const status = await this.fetchStatus();
      if (status) {
        this.applyStatus(status);
      }
    } catch (error) {
      console.error(error);
      this.elements.messageLabel.textContent = 'ステータス取得に失敗しました。';
    }
  }

  private async fetchStatus(): Promise<VersusTrainingStatusDto | null> {
    const response = await fetch('/api/versus/train/status', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to fetch versus training status');
    }
    return (await response.json()) as VersusTrainingStatusDto;
  }

  private applyStatus(status: VersusTrainingStatusDto): void {
    const {
      statusLabel,
      cycleLabel,
      avgScoreP1,
      avgScoreP2,
      avgLinesP1,
      avgLinesP2,
      winsLabel,
      updatedAtLabel,
      messageLabel,
      previewCanvasP1,
      previewCanvasP2,
      startButton,
      stopButton,
    } = this.elements;

    statusLabel.textContent = status.running ? '稼働中' : '停止中';
    cycleLabel.textContent = status.cycle.toString();
    avgScoreP1.textContent = formatStat(status.averageScore.p1);
    avgScoreP2.textContent = formatStat(status.averageScore.p2);
    avgLinesP1.textContent = formatStat(status.averageLines.p1);
    avgLinesP2.textContent = formatStat(status.averageLines.p2);
    winsLabel.textContent = `P1: ${status.wins.p1} / P2: ${status.wins.p2} / 引き分け: ${status.wins.ties}`;
    updatedAtLabel.textContent = formatTimestamp(status.updatedAt);
    messageLabel.textContent = status.message ?? '';

    drawPreviewMatrix(previewCanvasP1, status.previewBoardP1 ?? []);
    drawPreviewMatrix(previewCanvasP2, status.previewBoardP2 ?? []);

    startButton.disabled = status.running;
    stopButton.disabled = !status.running;

    if (status.updatedAt && status.updatedAt !== this.lastUpdateToken) {
      this.lastUpdateToken = status.updatedAt;
      void this.onWeightsUpdated();
    }
  }
}

interface VersusControllerElements {
  playButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  stepButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  loopButton: HTMLButtonElement;
  speedSlider: HTMLInputElement;
  speedLabel: HTMLElement;
  clearLogButton: HTMLButtonElement;
}

interface VersusControllerOptions {
  agents: [PatternInferenceAgent, PatternInferenceAgent];
  panels: [PlayerPanel, PlayerPanel];
  statusEl: HTMLElement;
  matchLabelEl: HTMLElement;
  controls: VersusControllerElements;
  log: VersusLog;
  maxMovesPerPlayer?: number;
}

class VersusMatchController {
  private environment: VersusEnvironment;

  private readonly maxMovesPerPlayer: number;

  private readonly panels: [PlayerPanel, PlayerPanel];

  private agents: [PatternInferenceAgent, PatternInferenceAgent];

  private readonly statusEl: HTMLElement;

  private readonly matchLabelEl: HTMLElement;

  private readonly controls: VersusControllerElements;

  private readonly log: VersusLog;

  private running = false;

  private autoLoop = false;

  private turn: 0 | 1 = 0;

  private matchNumber = 0;

  private rafId: number | null = null;

  private lastFrame = 0;

  constructor(options: VersusControllerOptions) {
    this.agents = options.agents;
    this.panels = options.panels;
    this.statusEl = options.statusEl;
    this.matchLabelEl = options.matchLabelEl;
    this.controls = options.controls;
    this.log = options.log;
    this.maxMovesPerPlayer = options.maxMovesPerPlayer ?? 4000;
    this.environment = this.createEnvironment();

    this.attachListeners();
    this.resetMatch(true);
  }

  updateAgents(agents: [PatternInferenceAgent, PatternInferenceAgent]): void {
    this.agents = agents;
    this.log.push('ウェイトからエージェントを再読込しました。', 'info');
    this.resetMatch(false);
  }

  private attachListeners(): void {
    const { playButton, pauseButton, stepButton, resetButton, loopButton, speedSlider, speedLabel, clearLogButton } =
      this.controls;
    playButton.addEventListener('click', () => this.start());
    pauseButton.addEventListener('click', () => this.pause());
    stepButton.addEventListener('click', () => this.step());
    resetButton.addEventListener('click', () => this.resetMatch(true));
    loopButton.addEventListener('click', () => this.toggleLoop());
    clearLogButton.addEventListener('click', () => {
      this.log.clear();
      this.log.push('ログをクリアしました。', 'info');
    });
    speedSlider.addEventListener('input', () => {
      const preset = getSpeedPreset(Number(speedSlider.value));
      speedLabel.textContent = `${preset.label} (${preset.interval}ms)`;
    });
    const preset = getSpeedPreset(Number(speedSlider.value));
    speedLabel.textContent = `${preset.label} (${preset.interval}ms)`;
  }

  private createEnvironment(): VersusEnvironment {
    const baseSeed = Math.floor(Math.random() * 10_000_000);
    return new VersusEnvironment({
      seedP1: baseSeed,
      seedP2: baseSeed ^ 0x5f5f5f,
      garbageSeed: baseSeed + 7919,
    });
  }

  private resetMatch(incrementMatchNumber: boolean): void {
    this.cancelAnimation();
    this.environment = this.createEnvironment();
    this.turn = 0;
    this.running = false;
    this.lastFrame = 0;
    if (incrementMatchNumber) {
      this.matchNumber += 1;
    }
    this.matchLabelEl.textContent = this.matchNumber.toString();
    this.updateStatus('準備完了');
    this.panels.forEach((panel) => panel.markState('idle'));
    this.updateViews(false);
    this.updateButtons();
    this.log.push(`--- マッチ #${this.matchNumber} start ---`, 'info');
  }

  private start(): void {
    if (this.running) {
      return;
    }
    if (this.environment.hasEnded()) {
      this.resetMatch(true);
    }
    this.running = true;
    this.updateButtons();
    this.updateStatus('対戦中');
    this.updateActivePlayer(this.turn);
    this.scheduleAnimation();
  }

  private pause(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.updateButtons();
    this.updateStatus('一時停止');
    this.cancelAnimation();
  }

  private step(): void {
    if (this.running) {
      return;
    }
    if (this.environment.hasEnded()) {
      this.resetMatch(true);
    }
    this.executeStep();
    this.updateButtons();
  }

  private toggleLoop(): void {
    this.autoLoop = !this.autoLoop;
    const { loopButton } = this.controls;
    loopButton.dataset.active = this.autoLoop ? 'true' : 'false';
    loopButton.textContent = this.autoLoop ? 'オートループ: ON' : 'オートループ: OFF';
    this.log.push(
      this.autoLoop ? 'オートループを有効化しました。' : 'オートループを無効化しました。',
      'info',
    );
  }

  private scheduleAnimation(): void {
    this.cancelAnimation();
    const tick = (timestamp: number) => {
      if (!this.running) {
        return;
      }
      if (!this.lastFrame) {
        this.lastFrame = timestamp;
      }
      const preset = getSpeedPreset(Number(this.controls.speedSlider.value));
      if (timestamp - this.lastFrame >= preset.interval) {
        this.executeStep();
        this.lastFrame = timestamp;
      }
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private executeStep(): void {
    if (this.environment.hasEnded()) {
      this.finishMatch();
      return;
    }
    const playerIndex = this.turn;
    const agent = this.agents[playerIndex];
    const result = this.environment.actWithAgent(playerIndex, agent);
    this.handleStepResult(result);
    this.turn = this.turn === 0 ? 1 : 0;
    this.updateActivePlayer(this.running ? this.turn : null);
    this.updateViews(true);
    if (this.environment.hasEnded()) {
      this.finishMatch();
      return;
    }
    if (this.reachedMoveLimit()) {
      this.finishMatch('ムーブ上限に達しました (引き分け)', null);
    }
  }

  private handleStepResult(result: VersusStepResult): void {
    if (result.outcome?.clear.linesCleared && result.outcome.clear.linesCleared > 0) {
      const playerLabel = result.playerIndex === 0 ? 'P1' : 'P2';
      const lines = result.outcome.clear.linesCleared;
      const clearName = result.outcome.clear.clearType.toUpperCase();
      const attack = result.rawAttack;
      const cancelled = result.garbageCancelled;
      const sent = result.garbageSent;
      const applied = result.garbageApplied;
      const parts = [
        `${playerLabel}: ${clearName} (${lines} lines)`,
        attack > 0 ? `攻撃=${attack}` : '',
        cancelled > 0 ? `相殺=${cancelled}` : '',
        sent > 0 ? `送信=${sent}` : '',
        applied > 0 ? `被弾=${applied}` : '',
      ].filter(Boolean);
      const variant: LogVariant =
        sent > 0 ? 'attack' : applied > 0 ? 'defence' : 'info';
      this.log.push(parts.join(' | '), variant);
    } else if (result.garbageApplied > 0) {
      const defender = result.playerIndex === 0 ? 'P1' : 'P2';
      this.log.push(
        `${defender}: ${result.garbageApplied} 行のガーベッジを受け取りました。`,
        'defence',
      );
    }
  }

  private reachedMoveLimit(): boolean {
    const snapshots: [VersusPlayerSnapshot, VersusPlayerSnapshot] = [
      this.environment.getPlayerSnapshot(0),
      this.environment.getPlayerSnapshot(1),
    ];
    return (
      snapshots[0].moves >= this.maxMovesPerPlayer &&
      snapshots[1].moves >= this.maxMovesPerPlayer
    );
  }

  private finishMatch(reason?: string, forcedWinner: 0 | 1 | null = this.environment.winner()): void {
    this.running = false;
    this.cancelAnimation();
    this.updateButtons();
    const winner = forcedWinner;
    if (winner === 0) {
      this.panels[0].markState('winner');
      this.panels[1].markState('loser');
      this.panels[0].setStatus('勝利！');
      this.panels[1].setStatus('敗北');
      this.updateStatus('P1 勝利');
      this.log.push(`マッチ #${this.matchNumber}: P1 が勝利しました。`, 'attack');
    } else if (winner === 1) {
      this.panels[1].markState('winner');
      this.panels[0].markState('loser');
      this.panels[1].setStatus('勝利！');
      this.panels[0].setStatus('敗北');
      this.updateStatus('P2 勝利');
      this.log.push(`マッチ #${this.matchNumber}: P2 が勝利しました。`, 'attack');
    } else {
      this.panels[0].markState('draw');
      this.panels[1].markState('draw');
      this.panels[0].setStatus('引き分け');
      this.panels[1].setStatus('引き分け');
      this.updateStatus(reason ?? '引き分け');
      this.log.push(`マッチ #${this.matchNumber}: 引き分けになりました。`, 'info');
    }
    if (reason) {
      this.log.push(reason, 'info');
    }
    if (this.autoLoop) {
      window.setTimeout(() => {
        this.resetMatch(true);
        this.start();
      }, 900);
    }
  }

  private updateViews(running: boolean): void {
    const snapshots: [VersusPlayerSnapshot, VersusPlayerSnapshot] = [
      this.environment.getPlayerSnapshot(0),
      this.environment.getPlayerSnapshot(1),
    ];
    const games: [TetrisGame, TetrisGame] = [
      this.environment.getGame(0),
      this.environment.getGame(1),
    ];
    this.panels[0].render(games[0]);
    this.panels[1].render(games[1]);
    this.panels[0].updateStats(snapshots[0]);
    this.panels[1].updateStats(snapshots[1]);
    if (!running && !this.environment.hasEnded()) {
      this.panels[0].setStatus('準備完了');
      this.panels[1].setStatus('準備完了');
    } else if (running) {
      this.panels[0].setStatus(snapshots[0].eliminated ? 'トップアウト' : '進行中');
      this.panels[1].setStatus(snapshots[1].eliminated ? 'トップアウト' : '進行中');
    }
  }

  private updateButtons(): void {
    const { playButton, pauseButton, stepButton } = this.controls;
    playButton.disabled = this.running;
    pauseButton.disabled = !this.running;
    stepButton.disabled = this.running;
  }

  private updateActivePlayer(player: 0 | 1 | null): void {
    if (player === null) {
      this.panels.forEach((panel) => panel.markState('idle'));
      return;
    }
    this.panels.forEach((panel, index) => {
      panel.markState(index === player ? 'active' : 'idle');
    });
  }

  private updateStatus(message: string): void {
    this.statusEl.textContent = message;
  }

  private cancelAnimation(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

async function fetchVersusWeights(): Promise<{
  p1: EvaluatorConfig;
  p2: EvaluatorConfig;
}> {
  try {
    const response = await fetch('/api/versus/weights', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch weights: ${response.status}`);
    }
    const data = (await response.json()) as { p1?: EvaluatorConfig; p2?: EvaluatorConfig };
    return {
      p1: data.p1 ?? { weights: { ...DEFAULT_WEIGHTS } },
      p2: data.p2 ?? { weights: { ...DEFAULT_WEIGHTS } },
    };
  } catch (error) {
    console.warn('Falling back to default weights for versus mode', error);
    return {
      p1: { weights: { ...DEFAULT_WEIGHTS } },
      p2: { weights: { ...DEFAULT_WEIGHTS } },
    };
  }
}

async function bootstrap(): Promise<void> {
  const statusEl = document.getElementById('versus-status');
  const matchLabelEl = document.getElementById('versus-match-number');
  const weightP1El = document.getElementById('versus-weight-p1');
  const weightP2El = document.getElementById('versus-weight-p2');
  const player1Root = document.getElementById('versus-player-1');
  const player2Root = document.getElementById('versus-player-2');
  const logList = document.getElementById('versus-log-list');
  const controls = {
    playButton: document.getElementById('btn-versus-play'),
    pauseButton: document.getElementById('btn-versus-pause'),
    stepButton: document.getElementById('btn-versus-step'),
    resetButton: document.getElementById('btn-versus-reset'),
    loopButton: document.getElementById('btn-versus-loop'),
    speedSlider: document.getElementById('versus-speed'),
    speedLabel: document.getElementById('versus-speed-label'),
    clearLogButton: document.getElementById('btn-versus-clear-log'),
  };

  const trainingElements = {
    startButton: document.getElementById('btn-versus-train-start'),
    stopButton: document.getElementById('btn-versus-train-stop'),
    reloadButton: document.getElementById('btn-versus-reload-weights'),
    statusLabel: document.getElementById('versus-train-status-label'),
    cycleLabel: document.getElementById('versus-train-cycle'),
    avgScoreP1: document.getElementById('versus-train-avg-score-p1'),
    avgScoreP2: document.getElementById('versus-train-avg-score-p2'),
    avgLinesP1: document.getElementById('versus-train-avg-lines-p1'),
    avgLinesP2: document.getElementById('versus-train-avg-lines-p2'),
    winsLabel: document.getElementById('versus-train-wins'),
    updatedAtLabel: document.getElementById('versus-train-updated-at'),
    messageLabel: document.getElementById('versus-train-message'),
    previewCanvasP1: document.getElementById('versus-train-preview-p1'),
    previewCanvasP2: document.getElementById('versus-train-preview-p2'),
  };

  if (
    !statusEl ||
    !matchLabelEl ||
    !weightP1El ||
    !weightP2El ||
    !player1Root ||
    !player2Root ||
    !logList ||
    Object.values(controls).some((el) => el === null) ||
    Object.values(trainingElements).some((el) => el === null)
  ) {
    throw new Error('Versus UI の初期化に必要な要素が足りません。');
  }

  (weightP1El as HTMLElement).textContent = 'weights_p1.json';
  (weightP2El as HTMLElement).textContent = 'weights_p2.json';

  statusEl.textContent = 'ウェイト読込中...';

  const weights = await fetchVersusWeights();
  const evaluatorP1 = new LinearEvaluator(weights.p1);
  const evaluatorP2 = new LinearEvaluator(weights.p2);
  const agentP1 = new PatternInferenceAgent(evaluatorP1, {
    enableHold: true,
    explorationRate: 0,
  });
  const agentP2 = new PatternInferenceAgent(evaluatorP2, {
    enableHold: true,
    explorationRate: 0,
  });

  const panels: [PlayerPanel, PlayerPanel] = [
    new PlayerPanel(player1Root, 'p1'),
    new PlayerPanel(player2Root, 'p2'),
  ];
  const versusLog = new VersusLog(logList);
  versusLog.clear();
  versusLog.push('Versusモードを初期化しました。', 'info');

  const matchController = new VersusMatchController({
    agents: [agentP1, agentP2],
    panels,
    statusEl,
    matchLabelEl,
    log: versusLog,
    controls: {
      playButton: controls.playButton as HTMLButtonElement,
      pauseButton: controls.pauseButton as HTMLButtonElement,
      stepButton: controls.stepButton as HTMLButtonElement,
      resetButton: controls.resetButton as HTMLButtonElement,
      loopButton: controls.loopButton as HTMLButtonElement,
      speedSlider: controls.speedSlider as HTMLInputElement,
      speedLabel: controls.speedLabel as HTMLElement,
      clearLogButton: controls.clearLogButton as HTMLButtonElement,
    },
    maxMovesPerPlayer: 4000,
  });

  const trainingClient = new VersusTrainingClient(
    {
      startButton: trainingElements.startButton as HTMLButtonElement,
      stopButton: trainingElements.stopButton as HTMLButtonElement,
      reloadButton: trainingElements.reloadButton as HTMLButtonElement,
      statusLabel: trainingElements.statusLabel as HTMLElement,
      cycleLabel: trainingElements.cycleLabel as HTMLElement,
      avgScoreP1: trainingElements.avgScoreP1 as HTMLElement,
      avgScoreP2: trainingElements.avgScoreP2 as HTMLElement,
      avgLinesP1: trainingElements.avgLinesP1 as HTMLElement,
      avgLinesP2: trainingElements.avgLinesP2 as HTMLElement,
      winsLabel: trainingElements.winsLabel as HTMLElement,
      updatedAtLabel: trainingElements.updatedAtLabel as HTMLElement,
      messageLabel: trainingElements.messageLabel as HTMLElement,
      previewCanvasP1: trainingElements.previewCanvasP1 as HTMLCanvasElement,
      previewCanvasP2: trainingElements.previewCanvasP2 as HTMLCanvasElement,
    },
    async () => {
      const updatedWeights = await fetchVersusWeights();
      const [newAgentP1, newAgentP2] = createAgentsFromWeights(updatedWeights);
      matchController.updateAgents([newAgentP1, newAgentP2]);
    },
  );

  trainingClient.start();
  statusEl.textContent = '準備完了';
}

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((error) => {
    console.error(error);
    const statusEl = document.getElementById('versus-status');
    if (statusEl) {
      statusEl.textContent = '初期化に失敗しました。コンソールを確認してください。';
    }
  });
});