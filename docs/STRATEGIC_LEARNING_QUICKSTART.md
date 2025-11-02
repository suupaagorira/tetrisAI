# 戦略的学習クイックスタートガイド

5分以内に戦略的学習を始めましょう！

## インストール

追加の依存関係は不要です - すべてメインプロジェクトに含まれています。

```bash
# 最新のコードを取得
git pull origin main

# 依存関係をインストール（まだの場合）
npm install

# プロジェクトをビルド
npm run build
```

## 基本的なトレーニング例

### 1. シンプルなトレーニングセッション

`examples/train_strategic.ts`ファイルを作成：

```typescript
import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine';

console.log('戦略的学習トレーニングを開始します...\n');

const result = runStrategicVersusTraining({
  totalEpisodes: 100,           // テスト用に少なめに設定
  maxStepsPerEpisode: 1000,     // より速いエピソード
  useCurriculum: true,          // 段階的難易度を有効化
  verbose: true,                // 進捗を表示
});

console.log('\n=== トレーニング完了 ===');
console.log(`総エピソード数: ${result.episodes.length}`);
console.log(`勝率: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
console.log(`平均スコア: ${result.finalStats.avgP1Score.toFixed(0)}`);
console.log(`\n勝利: ${result.winCounts.p1}`);
console.log(`敗北: ${result.winCounts.p2}`);
console.log(`引き分け: ${result.winCounts.ties}`);

// トレーニング済みエージェントを保存
import fs from 'fs';
const agentData = result.learningAgent.toJSON();
fs.writeFileSync('trained_agent.json', JSON.stringify(agentData, null, 2));
console.log('\n✓ エージェントをtrained_agent.jsonに保存しました');
```

### 2. 実行

```bash
npx tsx examples/train_strategic.ts
```

次のような出力が表示されます：

```
戦略的学習トレーニングを開始します...

[Episode 50/100] Recent win rate: 45.0% | Stage: Novice | ε_action: 0.095 | ε_strategy: 0.285
[Episode 100/100] Recent win rate: 62.0% | Stage: Beginner | ε_action: 0.090 | ε_strategy: 0.271

=== トレーニング完了 ===
総エピソード数: 100
勝率: 58.0%
平均スコア: 12543

勝利: 58
敗北: 40
引き分け: 2

✓ エージェントをtrained_agent.jsonに保存しました
```

## 出力の理解

### トレーニング進捗

- **Episode**: 現在のエピソード番号
- **Recent win rate**: 直近50エピソードの勝率
- **Stage**: 現在のカリキュラム難易度レベル
- **ε_action**: 手選択の探索率（低いほど決定論的）
- **ε_strategy**: 戦略選択の探索率

### 最終統計

- **Win Rate**: 対戦相手に対する勝率
- **Average Score**: 全エピソードの平均スコア
- **Wins/Losses/Ties**: ゲーム結果

## パフォーマンスの分析

### 戦略パフォーマンスを表示

```typescript
import { LearnableStrategicAgent } from '../src/ai/learnable_strategic_agent';
import fs from 'fs';

// トレーニング済みエージェントを読み込み
const agent = new LearnableStrategicAgent();
const data = JSON.parse(fs.readFileSync('trained_agent.json', 'utf-8'));
agent.fromJSON(data);

// パフォーマンス統計を取得
const tracker = agent.getPerformanceTracker();
const performance = tracker.getAllPerformance();

console.log('\n=== 戦略パフォーマンス ===\n');

for (const [strategy, stats] of performance) {
  if (stats.timesUsed > 0) {
    console.log(`${strategy}:`);
    console.log(`  使用回数: ${stats.timesUsed}`);
    console.log(`  勝率: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  平均スコア: ${stats.averageScore.toFixed(0)}`);
    console.log(`  平均ガベージ: ${stats.averageGarbageSent.toFixed(1)}`);
    console.log(`  平均報酬: ${stats.averageReward.toFixed(1)}`);
    console.log('');
  }
}
```

出力例：

```
=== 戦略パフォーマンス ===

B2B_PRESSURE:
  使用回数: 145
  勝率: 68.5%
  平均スコア: 18432
  平均ガベージ: 12.3
  平均報酬: 245.7

DEFENSE_CANCEL:
  使用回数: 87
  勝率: 52.3%
  平均スコア: 8234
  平均ガベージ: 5.1
  平均報酬: 123.4

CHEESE_FARMING:
  使用回数: 63
  勝率: 71.2%
  平均スコア: 21543
  平均ガベージ: 15.8
  平均報酬: 312.1
```

## 高度な使用方法

### カスタムトレーニング設定

```typescript
const result = runStrategicVersusTraining({
  // トレーニング期間
  totalEpisodes: 500,
  maxStepsPerEpisode: 2000,

  // 学習パラメータ
  actionLearningRate: 0.001,      // 手の学習速度
  strategyLearningRate: 0.01,     // 戦略の学習速度
  gamma: 0.95,                    // 将来の報酬を割引

  // 探索
  initialActionExploration: 0.1,   // ランダムな手の確率
  initialStrategyExploration: 0.3, // ランダムな戦略の確率

  // カリキュラム
  useCurriculum: true,            // 段階的難易度

  // その他
  seedBase: Date.now(),           // ランダムシード
  verbose: true,                  // ログ出力
  saveInterval: 100,              // N エピソードごとに保存
});
```

### GPU加速（将来）

```typescript
import { initializeGPU } from '../src/config/gpu_config';

// GPUを初期化
const gpuInit = initializeGPU({
  backend: 'cuda',  // または 'rocm', 'metal', 'cpu'
  deviceId: 0,
  batchSize: 64,
  memoryFraction: 0.8,
});

console.log(gpuInit.message);
// "CUDA バックエンドをデバイス0で初期化しました"
```

*注: GPU加速は現在、将来のニューラルネットワークサポートのためのプレースホルダーです。*

### トレーニングの再開

```typescript
import { LearnableStrategicAgent } from '../src/ai/learnable_strategic_agent';
import { CurriculumProgress } from '../src/training/curriculum';
import fs from 'fs';

// 以前のエージェントとカリキュラムを読み込み
const agent = new LearnableStrategicAgent();
agent.fromJSON(JSON.parse(fs.readFileSync('trained_agent.json', 'utf-8')));

const curriculum = new CurriculumProgress();
curriculum.fromJSON(JSON.parse(fs.readFileSync('curriculum.json', 'utf-8')));

// トレーニングを続行...
// (トレーニングループを修正して事前トレーニング済みエージェントを受け入れる必要があります)
```

## カリキュラムステージ

エージェントは自動的にこれらのステージを進行します：

| ステージ | 対戦相手の難易度 | 目標勝率 |
|---------|----------------|---------|
| 🟢 初心者 | とても簡単 | 70% |
| 🟡 中級者 | 簡単 | 65% |
| 🟠 中上級 | 普通 | 60% |
| 🔴 上級者 | 難しい | 55% |
| ⚫ エキスパート | とても難しい | 50% |

エージェントは目標勝率を達成し、最小エピソード数を完了すると進級します。

## 最良の結果を得るためのヒント

### 1. 小さく始める

```typescript
// 初期テストに適しています
totalEpisodes: 100,
maxStepsPerEpisode: 1000,
```

### 2. カリキュラムを使用

```typescript
// 強く推奨
useCurriculum: true,
```

カリキュラム学習は、簡単な対戦相手から始めることで、エージェントがより速く学習するのに役立ちます。

### 3. 探索率を監視

勝率が停滞している場合は、探索をチェックしてください：

```typescript
console.log(`Action ε: ${agent.getConfig().actionExplorationRate}`);
console.log(`Strategy ε: ${agent.getStrategySelector().getEpsilon()}`);
```

高すぎる = ランダムすぎる。低すぎる = 探索不足。

### 4. チェックポイントを保存

```typescript
// 100エピソードごとに保存
if (episodeNum % 100 === 0) {
  fs.writeFileSync(
    `agent_episode_${episodeNum}.json`,
    JSON.stringify(agent.toJSON(), null, 2)
  );
}
```

### 5. 戦略使用状況を分析

不均衡な戦略使用を探します：

```typescript
const stats = tracker.getAllPerformance();
const usageCounts = Array.from(stats.values()).map(s => s.timesUsed);
const maxUsage = Math.max(...usageCounts);
const minUsage = Math.min(...usageCounts.filter(c => c > 0));

if (maxUsage / minUsage > 10) {
  console.warn('⚠️  戦略使用が非常に不均衡です');
  console.log('戦略探索を増やすことを検討してください');
}
```

## よくある問題

### "勝率が向上しない"

**原因**: 学習率が高すぎるか低すぎる可能性

**修正**:
```typescript
actionLearningRate: 0.0005,    // 半分に
strategyLearningRate: 0.005,   // 半分に
```

### "エージェントが1つの戦略しか使わない"

**原因**: 探索不足

**修正**:
```typescript
initialStrategyExploration: 0.5,  // 0.3から増やす
```

### "トレーニングが非常に遅い"

**原因**: エピソードが長すぎるか多すぎる

**修正**:
```typescript
maxStepsPerEpisode: 500,     // 2000から削減
totalEpisodes: 200,          // より小さく始める
```

### "メモリ不足"

**原因**: エピソード履歴が多すぎて保存されている

**修正**: 定期的に履歴をクリア：
```typescript
if (episodeNum % 100 === 0) {
  agent.clearDecisionHistory();
}
```

## 次のステップ

1. **完全なドキュメントを読む**: `docs/STRATEGIC_LEARNING.md`
2. **パラメータを試す**: 異なる学習率と探索を試す
3. **トレーニングを可視化**: エピソードごとの勝率をプロット
4. **エージェントを比較**: 異なる設定で複数のエージェントをトレーニング
5. **貢献する**: あなたの発見と改善を共有してください！

## 例: 完全なトレーニングスクリプト

```typescript
import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine';
import fs from 'fs';

async function main() {
  console.log('🎮 TetrisAI 戦略的学習\n');

  const result = runStrategicVersusTraining({
    totalEpisodes: 500,
    useCurriculum: true,
    verbose: true,
  });

  // 結果を保存
  fs.writeFileSync('agent.json', JSON.stringify(result.learningAgent.toJSON(), null, 2));

  if (result.curriculumProgress) {
    fs.writeFileSync('curriculum.json', JSON.stringify(result.curriculumProgress.toJSON(), null, 2));
  }

  // サマリー
  console.log('\n📊 トレーニングサマリー:');
  console.log(`エピソード数: ${result.episodes.length}`);
  console.log(`勝率: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
  console.log(`平均スコア: ${result.finalStats.avgP1Score.toFixed(0)}`);

  if (result.curriculumProgress) {
    const stats = result.curriculumProgress.getStats();
    console.log(`最終ステージ: ${stats.currentStage}`);
    console.log(`全体進捗: ${(stats.overallProgress * 100).toFixed(1)}%`);
  }

  console.log('\n✅ トレーニング完了！');
}

main().catch(console.error);
```

楽しいトレーニングを！🚀
