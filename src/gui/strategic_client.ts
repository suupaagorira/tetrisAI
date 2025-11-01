/**
 * Strategic Versus Client
 *
 * Real-time visualization of strategic AI thinking process
 */

import { TetrisGame } from '../core/game';
import { Bag } from '../core/bag';
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
    const bag1 = new Bag(Date.now());
    const bag2 = new Bag(Date.now() + 1);

    this.matchState = {
      game1: new TetrisGame(bag1),
      game2: new TetrisGame(bag2),
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

      const initialLines1 = game1.lines;
      agent1.act(game1);
      const linesCleared1 = game1.lines - initialLines1;

      // Update thinking panel for P1
      this.updateThinkingPanel(1, agent1);

      if (linesCleared1 > 0) {
        const garbage = this.calculateGarbage(linesCleared1, game1.backToBack, game1.combo);
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

      const initialLines2 = game2.lines;
      agent2.act(game2);
      const linesCleared2 = game2.lines - initialLines2;

      // Update thinking panel for P2
      this.updateThinkingPanel(2, agent2);

      if (linesCleared2 > 0) {
        const garbage = this.calculateGarbage(linesCleared2, game2.backToBack, game2.combo);
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

    const prefix = player === 1 ? 'p1' : 'p2';
    const els = this.elements;

    // Strategy
    els[`${prefix}Strategy` as keyof typeof els].textContent = decision.strategyName;
    els[`${prefix}Dwell` as keyof typeof els].textContent = `${(decision.strategyDwellTime / 1000).toFixed(1)}s`;

    // Template
    els[`${prefix}Template` as keyof typeof els].textContent = decision.templateName;

    // Trigger
    if (decision.triggeredBy) {
      els[`${prefix}TriggerSection` as keyof typeof els].style.display = 'block';
      els[`${prefix}Trigger` as keyof typeof els].textContent = decision.triggeredBy;
      els[`${prefix}TriggerReason` as keyof typeof els].textContent = decision.triggerReason ?? '-';
    } else {
      els[`${prefix}TriggerSection` as keyof typeof els].style.display = 'none';
    }

    // Evaluation
    els[`${prefix}Evaluation` as keyof typeof els].textContent = decision.evaluation.toFixed(2);
    els[`${prefix}Candidates` as keyof typeof els].textContent = decision.candidatesEvaluated.toString();
    els[`${prefix}Beam` as keyof typeof els].textContent = decision.beamWidth.toString();

    // Versus state
    if (decision.versusState) {
      const killProb = (decision.versusState.killProbability ?? 0) * 100;
      const heightAdv = (decision.versusState.heightAdvantage ?? 0) * 20;
      const attackPot = ((decision.features?.attack_potential ?? 0) * 100);

      els[`${prefix}KillProb` as keyof typeof els].textContent = `${killProb.toFixed(1)}%`;
      els[`${prefix}HeightAdv` as keyof typeof els].textContent = heightAdv.toFixed(1);
      els[`${prefix}AttackPot` as keyof typeof els].textContent = `${attackPot.toFixed(0)}%`;
    }

    // Latency
    const latency = decision.decisionLatency;
    els[`${prefix}Latency` as keyof typeof els].textContent = `${latency.toFixed(1)}ms`;
    const latencyPercent = Math.min((latency / 8) * 100, 100);
    els[`${prefix}LatencyBar` as keyof typeof els].style.width = `${latencyPercent}%`;

    // Rationale
    els[`${prefix}Rationale` as keyof typeof els].textContent = decision.rationale;
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

    // Draw board cells
    for (let y = 2; y < game.board.height; y++) {
      for (let x = 0; x < game.board.width; x++) {
        const cell = game.board.cells[y]![x];
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
    if (game.activePiece) {
      const piece = game.activePiece;
      const shape = piece.shape;
      const color = COLORS[piece.type === 'I' ? 1 : piece.type === 'O' ? 2 : piece.type === 'T' ? 3 : piece.type === 'S' ? 4 : piece.type === 'Z' ? 5 : piece.type === 'L' ? 6 : 7];

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;

      for (const [dx, dy] of shape) {
        const x = piece.x + dx;
        const y = piece.y + dy - 2;

        if (y >= 0) {
          ctx.fillRect(
            x * CELL_SIZE,
            y * CELL_SIZE,
            CELL_SIZE - 1,
            CELL_SIZE - 1
          );
        }
      }

      ctx.globalAlpha = 1.0;
    }
  }

  private updateStats(player: 1 | 2, game: TetrisGame, garbageQueue: number): void {
    const prefix = player === 1 ? 'p1' : 'p2';
    const els = this.elements;

    els[`${prefix}Score` as keyof typeof els].textContent = game.score.toString();
    els[`${prefix}Lines` as keyof typeof els].textContent = game.lines.toString();
    els[`${prefix}Combo` as keyof typeof els].textContent = game.combo.toString();
    els[`${prefix}B2b` as keyof typeof els].textContent = game.backToBack ? 'YES' : '-';
    els[`${prefix}Sent` as keyof typeof els].textContent = '0'; // TODO: track sent garbage
    els[`${prefix}Recv` as keyof typeof els].textContent = garbageQueue.toString();
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
    let maxHeight = 0;
    for (let x = 0; x < game.board.width; x++) {
      for (let y = 2; y < game.board.height; y++) {
        if (game.board.cells[y]![x] !== 0) {
          const height = game.board.height - y - 2;
          maxHeight = Math.max(maxHeight, height);
          break;
        }
      }
    }
    return maxHeight;
  }

  private calculateHoles(game: TetrisGame): number {
    let holes = 0;
    for (let x = 0; x < game.board.width; x++) {
      let foundBlock = false;
      for (let y = 2; y < game.board.height; y++) {
        if (game.board.cells[y]![x] !== 0) {
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
