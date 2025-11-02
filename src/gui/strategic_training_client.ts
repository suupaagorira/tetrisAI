/**
 * Strategic Training Client
 *
 * GUI for strategic learning training with curriculum visualization
 */

interface StrategicTrainingStatus {
  running: boolean;
  totalEpisodes: number;
  currentStage: string;
  winRate: number;
  averageScore: number;
  strategyStats: Record<string, { count: number; wins: number; avgScore: number }>;
  updatedAt: string | null;
  message?: string;
}

class StrategicTrainingClient {
  private pollInterval: number | null = null;
  private readonly POLL_RATE = 1000; // Poll every 1 second

  private elements = {
    btnStart: document.getElementById('btn-start') as HTMLButtonElement,
    btnStop: document.getElementById('btn-stop') as HTMLButtonElement,
    statusIndicator: document.getElementById('status-indicator') as HTMLElement,
    statusText: document.getElementById('status-text') as HTMLElement,
    messageContainer: document.getElementById('message-container') as HTMLElement,

    // Stage indicators
    stageNovice: document.getElementById('stage-novice') as HTMLElement,
    stageBeginner: document.getElementById('stage-beginner') as HTMLElement,
    stageIntermediate: document.getElementById('stage-intermediate') as HTMLElement,
    stageAdvanced: document.getElementById('stage-advanced') as HTMLElement,
    stageExpert: document.getElementById('stage-expert') as HTMLElement,

    // Progress
    progressFill: document.getElementById('progress-fill') as HTMLElement,
    progressText: document.getElementById('progress-text') as HTMLElement,

    // Stats
    currentStage: document.getElementById('current-stage') as HTMLElement,
    totalEpisodes: document.getElementById('total-episodes') as HTMLElement,
    winRate: document.getElementById('win-rate') as HTMLElement,
    avgScore: document.getElementById('avg-score') as HTMLElement,
    lastUpdate: document.getElementById('last-update') as HTMLElement,

    // Strategy stats
    strategyStats: document.getElementById('strategy-stats') as HTMLElement,
  };

  private stageMap: Record<string, HTMLElement> = {
    'Novice': this.elements.stageNovice,
    'Beginner': this.elements.stageBeginner,
    'Intermediate': this.elements.stageIntermediate,
    'Advanced': this.elements.stageAdvanced,
    'Expert': this.elements.stageExpert,
  };

  constructor() {
    this.setupEventListeners();
    this.updateStatus();
  }

  private setupEventListeners(): void {
    this.elements.btnStart.addEventListener('click', () => this.startTraining());
    this.elements.btnStop.addEventListener('click', () => this.stopTraining());
  }

  private async startTraining(): Promise<void> {
    try {
      const response = await fetch('/api/strategic/train/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.updateUI(data.status);
      this.showMessage('学習を開始しました', 'success');

      // Start polling
      if (!this.pollInterval) {
        this.pollInterval = window.setInterval(() => this.updateStatus(), this.POLL_RATE);
      }
    } catch (error) {
      this.showMessage(
        `学習開始エラー: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }
  }

  private async stopTraining(): Promise<void> {
    try {
      const response = await fetch('/api/strategic/train/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.updateUI(data.status);
      this.showMessage('学習を停止しました', 'success');

      // Stop polling
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    } catch (error) {
      this.showMessage(
        `学習停止エラー: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }
  }

  private async updateStatus(): Promise<void> {
    try {
      const response = await fetch('/api/strategic/train/status');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const status: StrategicTrainingStatus = await response.json();
      this.updateUI(status);

      // Stop polling if training is not running
      if (!status.running && this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    } catch (error) {
      console.error('Status update failed:', error);
    }
  }

  private updateUI(status: StrategicTrainingStatus): void {
    // Update button states
    this.elements.btnStart.disabled = status.running;
    this.elements.btnStop.disabled = !status.running;

    // Update status indicator
    if (status.running) {
      this.elements.statusIndicator.className = 'status-indicator running';
      this.elements.statusText.textContent = '学習中';
    } else {
      this.elements.statusIndicator.className = 'status-indicator stopped';
      this.elements.statusText.textContent = '停止中';
    }

    // Update stage indicators
    Object.keys(this.stageMap).forEach((stageName) => {
      const element = this.stageMap[stageName];
      if (!element) return;

      element.className = 'stage';
      if (stageName === status.currentStage) {
        element.classList.add('active');
      }
    });

    // Update progress bar (based on stage)
    const stages = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
    const currentStageIndex = stages.indexOf(status.currentStage);
    const progress = currentStageIndex >= 0 ? ((currentStageIndex + 1) / stages.length) * 100 : 0;
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressText.textContent = `${Math.round(progress)}%`;

    // Update stats
    this.elements.currentStage.textContent = status.currentStage;
    this.elements.totalEpisodes.textContent = status.totalEpisodes.toString();
    this.elements.winRate.textContent = `${(status.winRate * 100).toFixed(1)}%`;
    this.elements.avgScore.textContent = Math.round(status.averageScore).toString();

    if (status.updatedAt) {
      const date = new Date(status.updatedAt);
      this.elements.lastUpdate.textContent = date.toLocaleTimeString('ja-JP');
    }

    // Update strategy stats
    this.updateStrategyStats(status.strategyStats);

    // Show message if present
    if (status.message) {
      this.showMessage(status.message, 'error');
    }
  }

  private updateStrategyStats(
    stats: Record<string, { count: number; wins: number; avgScore: number }>
  ): void {
    const strategyNames: Record<string, string> = {
      'S1': 'B2B Pressure',
      'S2': 'Combo Chain',
      'S3': 'Perfect Clear',
      'S4': 'Downstack',
      'S5': 'Tempo Control',
      'S6': 'Defensive',
    };

    this.elements.strategyStats.innerHTML = '';

    Object.entries(stats).forEach(([strategy, stat]) => {
      const card = document.createElement('div');
      card.className = 'strategy-card';

      const winRate = stat.count > 0 ? (stat.wins / stat.count) * 100 : 0;

      card.innerHTML = `
        <h3>${strategyNames[strategy] || strategy}</h3>
        <div class="strategy-stat">
          <span>使用回数:</span>
          <span style="color: #00ffff;">${stat.count}</span>
        </div>
        <div class="strategy-stat">
          <span>勝利数:</span>
          <span style="color: #00ff00;">${stat.wins}</span>
        </div>
        <div class="strategy-stat">
          <span>勝率:</span>
          <span style="color: #ffff00;">${winRate.toFixed(1)}%</span>
        </div>
        <div class="strategy-stat">
          <span>平均スコア:</span>
          <span style="color: #ff00ff;">${Math.round(stat.avgScore)}</span>
        </div>
      `;

      this.elements.strategyStats.appendChild(card);
    });
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    const message = document.createElement('div');
    message.className = `message ${type === 'success' ? 'success' : ''}`;
    message.textContent = text;

    this.elements.messageContainer.innerHTML = '';
    this.elements.messageContainer.appendChild(message);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (message.parentNode === this.elements.messageContainer) {
        this.elements.messageContainer.removeChild(message);
      }
    }, 5000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new StrategicTrainingClient();
  });
} else {
  new StrategicTrainingClient();
}
