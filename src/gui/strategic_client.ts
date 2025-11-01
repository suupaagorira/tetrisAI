/**
 * Strategic Versus Client
 *
 * Real-time visualization of strategic AI thinking process
 */

import { TetrisGame } from '../core/game';
import { createVersusAgent, StrategicAgent } from '../ai/strategic_agent';
import { VersusContext } from '../ai/features_extended';
import { DecisionTelemetry } from '../ai/telemetry';

// Constants
const CELL_SIZE = 16;
const COLORS: Record<number, string> = {
  0: '#0a0e27',
  1: '#00ffff', // I
  2: '#ffff00', // O
  3: '#ff00ff', // T
  4: '#00ff00', // S
  5: '#ff0000', // Z
  6: '#ff8800', // L
  7: '#0088ff', // J
  8: '#888888', // Garbage
};

interface MatchState {
  game1: TetrisGame;
  game2: TetrisGame;
  agent1: StrategicAgent;
  agent2: StrategicAgent;
  garbageQueue1: number;
  garbageQueue2: number;
  moveCount: number;
  running: boolean;
  paused: boolean;
  winner: 1 | 2 | null;
}

class StrategicVersusClient {
  private matchState: MatchState | null = null;
  private animationId: number | null = null;
  private speed: number = 200;

  // Canvas elements
  private canvas1: HTMLCanvasElement;
  private canvas2: HTMLCanvasElement;
  private ctx1: CanvasRenderingContext2D;
  private ctx2: CanvasRenderingContext2D;

  // UI elements
  private elements = {
    // Controls
    btnStart: document.getElementById('btn-start') as HTMLButtonElement,
    btnPause: document.getElementById('btn-pause') as HTMLButtonElement,
    btnStep: document.getElementById('btn-step') as HTMLButtonElement,
    btnReset: document.getElementById('btn-reset') as HTMLButtonElement,
    speedSelect: document.getElementById('speed-select') as HTMLSelectElement,

    // Match info
    moveCount: document.getElementById('move-count') as HTMLElement,
    winnerDisplay: document.getElementById('winner-display') as HTMLElement,
    matchLog: document.getElementById('match-log-list') as HTMLUListElement,

    // P1 Stats
    p1Score: document.getElementById('p1-score') as HTMLElement,
    p1Lines: document.getElementById('p1-lines') as HTMLElement,
    p1Combo: document.getElementById('p1-combo') as HTMLElement,
    p1B2b: document.getElementById('p1-b2b') as HTMLElement,
    p1Sent: document.getElementById('p1-sent') as HTMLElement,
    p1Recv: document.getElementById('p1-recv') as HTMLElement,

    // P2 Stats
    p2Score: document.getElementById('p2-score') as HTMLElement,
    p2Lines: document.getElementById('p2-lines') as HTMLElement,
    p2Combo: document.getElementById('p2-combo') as HTMLElement,
    p2B2b: document.getElementById('p2-b2b') as HTMLElement,
    p2Sent: document.getElementById('p2-sent') as HTMLElement,
    p2Recv: document.getElementById('p2-recv') as HTMLElement,

    // P1 Thinking
    p1Strategy: document.getElementById('p1-strategy') as HTMLElement,
    p1Dwell: document.getElementById('p1-dwell') as HTMLElement,
    p1Template: document.getElementById('p1-template') as HTMLElement,
    p1TriggerSection: document.getElementById('p1-trigger-section') as HTMLElement,
    p1Trigger: document.getElementById('p1-trigger') as HTMLElement,
    p1TriggerReason: document.getElementById('p1-trigger-reason') as HTMLElement,
    p1Evaluation: document.getElementById('p1-evaluation') as HTMLElement,
    p1Candidates: document.getElementById('p1-candidates') as HTMLElement,
    p1Beam: document.getElementById('p1-beam') as HTMLElement,
    p1KillProb: document.getElementById('p1-kill-prob') as HTMLElement,
    p1HeightAdv: document.getElementById('p1-height-adv') as HTMLElement,
    p1AttackPot: document.getElementById('p1-attack-pot') as HTMLElement,
    p1Latency: document.getElementById('p1-latency') as HTMLElement,
    p1LatencyBar: document.getElementById('p1-latency-bar') as HTMLElement,
    p1Rationale: document.getElementById('p1-rationale') as HTMLElement,

    // P2 Thinking
    p2Strategy: document.getElementById('p2-strategy') as HTMLElement,
    p2Dwell: document.getElementById('p2-dwell') as HTMLElement,
    p2Template: document.getElementById('p2-template') as HTMLElement,
    p2TriggerSection: document.getElementById('p2-trigger-section') as HTMLElement,
    p2Trigger: document.getElementById('p2-trigger') as HTMLElement,
    p2TriggerReason: document.getElementById('p2-trigger-reason') as HTMLElement,
    p2Evaluation: document.getElementById('p2-evaluation') as HTMLElement,
    p2Candidates: document.getElementById('p2-candidates') as HTMLElement,
    p2Beam: document.getElementById('p2-beam') as HTMLElement,
    p2KillProb: document.getElementById('p2-kill-prob') as HTMLElement,
    p2HeightAdv: document.getElementById('p2-height-adv') as HTMLElement,
    p2AttackPot: document.getElementById('p2-attack-pot') as HTMLElement,
    p2Latency: document.getElementById('p2-latency') as HTMLElement,
    p2LatencyBar: document.getElementById('p2-latency-bar') as HTMLElement,
    p2Rationale: document.getElementById('p2-rationale') as HTMLElement,
  };

  constructor() {
    this.canvas1 = document.getElementById('board-p1') as HTMLCanvasElement;
    this.canvas2 = document.getElementById('board-p2') as HTMLCanvasElement;
    this.ctx1 = this.canvas1.getContext('2d')!;
    this.ctx2 = this.canvas2.getContext('2d')!;

    this.setupEventListeners();
    this.initializeMatch();
  }

  private setupEventListeners(): void {
    this.elements.btnStart.addEventListener('click', () => this.start());
    this.elements.btnPause.addEventListener('click', () => this.pause());
    this.elements.btnStep.addEventListener('click', () => this.step());
    this.elements.btnReset.addEventListener('click', () => this.reset());
    this.elements.speedSelect.addEventListener('change', (e) => {
      this.speed = parseInt((e.target as HTMLSelectElement).value);
    });
  }

  private initializeMatch(): void {
    this.matchState = {
      game1: new TetrisGame({ seed: Date.now() }),
      game2: new TetrisGame({ seed: Date.now() + 1 }),
      agent1: createVersusAgent(),
      agent2: createVersusAgent(),
      garbageQueue1: 0,
      garbageQueue2: 0,
      moveCount: 0,
      running: false,
      paused: false,
      winner: null
    };

    this.render();
    this.addLog('対戦準備完了', 'event');
  }

  private start(): void {
    if (!this.matchState) return;

    this.matchState.running = true;
    this.matchState.paused = false;
    this.elements.btnStart.disabled = true;
    this.elements.btnPause.disabled = false;
    this.addLog('対戦開始！', 'event');
    this.gameLoop();
  }

  private pause(): void {
    if (!this.matchState) return;

    this.matchState.paused = !this.matchState.paused;
    this.elements.btnPause.textContent = this.matchState.paused ? '再開' : '一時停止';

    if (!this.matchState.paused) {
      this.gameLoop();
    }
  }

  private step(): void {
    if (!this.matchState) return;

    this.matchState.paused = true;
    this.executeMove();
  }

  private reset(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.elements.btnStart.disabled = false;
    this.elements.btnPause.disabled = true;
    this.elements.btnPause.textContent = '一時停止';
    this.elements.winnerDisplay.style.display = 'none';
    this.elements.matchLog.innerHTML = '';

    this.initializeMatch();
  }

  private async gameLoop(): Promise<void> {
    if (!this.matchState || !this.matchState.running || this.matchState.paused) {
      return;
    }

    if (this.matchState.winner) {
      this.showWinner();
      return;
    }

    await this.executeMove();

    this.animationId = window.setTimeout(() => {
      this.gameLoop();
    }, this.speed);
  }

  private async executeMove(): Promise<void> {
    if (!this.matchState) return;

    const { game1, game2, agent1, agent2 } = this.matchState;

    // Check for game over
    if (game1.isGameOver() || game2.isGameOver()) {
      this.matchState.winner = game1.isGameOver() ? 2 : 1;
      this.matchState.running = false;
      return;
    }

    // Player 1 move
    if (!game1.isGameOver()) {
      const p2Height = this.calculateMaxHeight(game2);
      const p2Holes = this.calculateHoles(game2);

      const context1: VersusContext = {
        opponentHeight: p2Height / 20,
        opponentHoles: p2Holes / 200,
        incomingGarbage: this.matchState.garbageQueue1,
        outgoingGarbage: 0,
        canCancel: this.matchState.garbageQueue1 > 0
      };

      agent1.setVersusContext(context1);

      const initialStats1 = game1.getStats();
      agent1.act(game1);
      const currentStats1 = game1.getStats();
      const linesCleared1 = currentStats1.lines - initialStats1.lines;

      // Update thinking panel for P1
      this.updateThinkingPanel(1, agent1);

      if (linesCleared1 > 0) {
        const garbage = this.calculateGarbage(linesCleared1, currentStats1.backToBack, currentStats1.combo);
        this.matchState.garbageQueue2 += garbage;

        if (garbage > 0) {
          this.addLog(`P1: ${linesCleared1}ライン消去 → P2に${garbage}ライン送信`, 'p1');
        }
      }
    }

    // Player 2 move
    if (!game2.isGameOver()) {
      const p1Height = this.calculateMaxHeight(game1);
      const p1Holes = this.calculateHoles(game1);

      const context2: VersusContext = {
        opponentHeight: p1Height / 20,
        opponentHoles: p1Holes / 200,
        incomingGarbage: this.matchState.garbageQueue2,
        outgoingGarbage: 0,
        canCancel: this.matchState.garbageQueue2 > 0
      };

      agent2.setVersusContext(context2);

      const initialStats2 = game2.getStats();
      agent2.act(game2);
      const currentStats2 = game2.getStats();
      const linesCleared2 = currentStats2.lines - initialStats2.lines;

      // Update thinking panel for P2
      this.updateThinkingPanel(2, agent2);

      if (linesCleared2 > 0) {
        const garbage = this.calculateGarbage(linesCleared2, currentStats2.backToBack, currentStats2.combo);
        this.matchState.garbageQueue1 += garbage;

        if (garbage > 0) {
          this.addLog(`P2: ${linesCleared2}ライン消去 → P1に${garbage}ライン送信`, 'p2');
        }
      }
    }

    this.matchState.moveCount++;
    this.render();
  }

  private updateThinkingPanel(player: 1 | 2, agent: StrategicAgent): void {
    const telemetry = agent.getTelemetry();
    const recentDecisions = telemetry?.getRecentDecisions(1);
    const decision: DecisionTelemetry | undefined = recentDecisions?.[0];

    if (!decision) return;

    const els = this.elements;

    // Strategy
    const strategyEl = player === 1 ? els.p1Strategy : els.p2Strategy;
    const dwellEl = player === 1 ? els.p1Dwell : els.p2Dwell;
    strategyEl.textContent = decision.strategyName;
    dwellEl.textContent = `${(decision.strategyDwellTime / 1000).toFixed(1)}s`;

    // Template
    const templateEl = player === 1 ? els.p1Template : els.p2Template;
    templateEl.textContent = decision.templateName;

    // Trigger
    const triggerSectionEl = player === 1 ? els.p1TriggerSection : els.p2TriggerSection;
    const triggerEl = player === 1 ? els.p1Trigger : els.p2Trigger;
    const triggerReasonEl = player === 1 ? els.p1TriggerReason : els.p2TriggerReason;
    if (decision.triggeredBy) {
      triggerSectionEl.style.display = 'block';
      triggerEl.textContent = decision.triggeredBy;
      triggerReasonEl.textContent = decision.triggerReason ?? '-';
    } else {
      triggerSectionEl.style.display = 'none';
    }

    // Evaluation
    const evaluationEl = player === 1 ? els.p1Evaluation : els.p2Evaluation;
    const candidatesEl = player === 1 ? els.p1Candidates : els.p2Candidates;
    const beamEl = player === 1 ? els.p1Beam : els.p2Beam;
    evaluationEl.textContent = decision.evaluation.toFixed(2);
    candidatesEl.textContent = decision.candidatesEvaluated.toString();
    beamEl.textContent = decision.beamWidth.toString();

    // Versus state
    if (decision.versusState) {
      const killProb = (decision.versusState.killProbability ?? 0) * 100;
      const heightAdv = (decision.versusState.heightAdvantage ?? 0) * 20;
      const attackPot = ((decision.features?.attack_potential ?? 0) * 100);

      const killProbEl = player === 1 ? els.p1KillProb : els.p2KillProb;
      const heightAdvEl = player === 1 ? els.p1HeightAdv : els.p2HeightAdv;
      const attackPotEl = player === 1 ? els.p1AttackPot : els.p2AttackPot;
      killProbEl.textContent = `${killProb.toFixed(1)}%`;
      heightAdvEl.textContent = heightAdv.toFixed(1);
      attackPotEl.textContent = `${attackPot.toFixed(0)}%`;
    }

    // Latency
    const latency = decision.decisionLatency;
    const latencyEl = player === 1 ? els.p1Latency : els.p2Latency;
    const latencyBarEl = player === 1 ? els.p1LatencyBar : els.p2LatencyBar;
    latencyEl.textContent = `${latency.toFixed(1)}ms`;
    const latencyPercent = Math.min((latency / 8) * 100, 100);
    latencyBarEl.style.width = `${latencyPercent}%`;

    // Rationale
    const rationaleEl = player === 1 ? els.p1Rationale : els.p2Rationale;
    rationaleEl.textContent = decision.rationale;
  }

  private render(): void {
    if (!this.matchState) return;

    // Update move count
    this.elements.moveCount.textContent = this.matchState.moveCount.toString();

    // Render boards
    this.renderBoard(this.ctx1, this.matchState.game1);
    this.renderBoard(this.ctx2, this.matchState.game2);

    // Update stats
    this.updateStats(1, this.matchState.game1, this.matchState.garbageQueue1);
    this.updateStats(2, this.matchState.game2, this.matchState.garbageQueue2);
  }

  private renderBoard(ctx: CanvasRenderingContext2D, game: TetrisGame): void {
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const board = game.getBoard();

    // Draw board cells
    for (let y = 2; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const row = board.cells[y];
        const cell = row ? row[x] : 0;
        const color = COLORS[cell ?? 0];

        ctx.fillStyle = color;
        ctx.fillRect(
          x * CELL_SIZE,
          (y - 2) * CELL_SIZE,
          CELL_SIZE - 1,
          CELL_SIZE - 1
        );
      }
    }

    // Draw active piece
    const activePiece = game.getActivePiece();
    if (activePiece) {
      const piece = activePiece;
      const color = COLORS[piece.type === 'I' ? 1 : piece.type === 'O' ? 2 : piece.type === 'T' ? 3 : piece.type === 'S' ? 4 : piece.type === 'Z' ? 5 : piece.type === 'L' ? 6 : 7];

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;

      // Get absolute cells for the piece
      const cells = this.getPieceCells(piece);
      for (const { x, y } of cells) {
        const displayY = y - 2;
        if (displayY >= 0) {
          ctx.fillRect(
            x * CELL_SIZE,
            displayY * CELL_SIZE,
            CELL_SIZE - 1,
            CELL_SIZE - 1
          );
        }
      }

      ctx.globalAlpha = 1.0;
    }
  }

  private getPieceCells(piece: { type: string; rotation: number; position: { x: number; y: number } }): { x: number; y: number }[] {
    // Simple piece shape definitions (relative to piece position)
    const shapes: Record<string, number[][][]> = {
      I: [
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[1, 0], [1, 1], [1, 2], [1, 3]]
      ],
      O: [
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]]
      ],
      T: [
        [[1, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [0, 1], [1, 1], [1, 2]]
      ],
      S: [
        [[1, 0], [2, 0], [0, 1], [1, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[1, 1], [2, 1], [0, 2], [1, 2]],
        [[0, 0], [0, 1], [1, 1], [1, 2]]
      ],
      Z: [
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[2, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 0], [0, 1], [1, 1], [0, 2]]
      ],
      J: [
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [0, 2], [1, 2]]
      ],
      L: [
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 1], [0, 2]],
        [[0, 0], [1, 0], [1, 1], [1, 2]]
      ]
    };

    const shape = shapes[piece.type]?.[piece.rotation] ?? [];
    return shape.map(([dx, dy]) => ({
      x: piece.position.x + (dx ?? 0),
      y: piece.position.y + (dy ?? 0)
    }));
  }

  private updateStats(player: 1 | 2, game: TetrisGame, garbageQueue: number): void {
    const els = this.elements;
    const stats = game.getStats();

    const scoreEl = player === 1 ? els.p1Score : els.p2Score;
    const linesEl = player === 1 ? els.p1Lines : els.p2Lines;
    const comboEl = player === 1 ? els.p1Combo : els.p2Combo;
    const b2bEl = player === 1 ? els.p1B2b : els.p2B2b;
    const sentEl = player === 1 ? els.p1Sent : els.p2Sent;
    const recvEl = player === 1 ? els.p1Recv : els.p2Recv;

    scoreEl.textContent = stats.score.toString();
    linesEl.textContent = stats.lines.toString();
    comboEl.textContent = stats.combo.toString();
    b2bEl.textContent = stats.backToBack ? 'YES' : '-';
    sentEl.textContent = '0'; // TODO: track sent garbage
    recvEl.textContent = garbageQueue.toString();
  }

  private showWinner(): void {
    if (!this.matchState) return;

    const winner = this.matchState.winner;
    this.elements.winnerDisplay.textContent = winner === 1 ? '🏆 PLAYER 1 WINS! 🏆' : '🏆 PLAYER 2 WINS! 🏆';
    this.elements.winnerDisplay.style.display = 'block';

    this.elements.btnStart.disabled = false;
    this.elements.btnPause.disabled = true;

    this.addLog(`${winner === 1 ? 'Player 1' : 'Player 2'} の勝利！`, 'event');
  }

  private calculateMaxHeight(game: TetrisGame): number {
    const board = game.getBoard();
    let maxHeight = 0;
    for (let x = 0; x < board.width; x++) {
      for (let y = 2; y < board.height; y++) {
        const row = board.cells[y];
        if (row && row[x] !== 0) {
          const height = board.height - y - 2;
          maxHeight = Math.max(maxHeight, height);
          break;
        }
      }
    }
    return maxHeight;
  }

  private calculateHoles(game: TetrisGame): number {
    const board = game.getBoard();
    let holes = 0;
    for (let x = 0; x < board.width; x++) {
      let foundBlock = false;
      for (let y = 2; y < board.height; y++) {
        const row = board.cells[y];
        if (row && row[x] !== 0) {
          foundBlock = true;
        } else if (foundBlock) {
          holes++;
        }
      }
    }
    return holes;
  }

  private calculateGarbage(linesCleared: number, backToBack: boolean, combo: number): number {
    let garbage = 0;

    if (linesCleared === 1) garbage = 0;
    else if (linesCleared === 2) garbage = 1;
    else if (linesCleared === 3) garbage = 2;
    else if (linesCleared >= 4) garbage = 4;

    if (backToBack && linesCleared >= 4) {
      garbage += 1;
    }

    if (combo > 1) {
      garbage += Math.floor(combo / 2);
    }

    return garbage;
  }

  private addLog(message: string, type: 'p1' | 'p2' | 'event'): void {
    const li = document.createElement('li');
    li.className = type;
    li.textContent = `[Move ${this.matchState?.moveCount ?? 0}] ${message}`;
    this.elements.matchLog.appendChild(li);
    this.elements.matchLog.scrollTop = this.elements.matchLog.scrollHeight;

    // Keep only last 50 messages
    while (this.elements.matchLog.children.length > 50) {
      this.elements.matchLog.removeChild(this.elements.matchLog.firstChild!);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new StrategicVersusClient();
  });
} else {
  new StrategicVersusClient();
}
