# 戦略的学習モード

このドキュメントでは、TetrisAIの戦略的学習実装について説明します。[Issue #22](https://github.com/suupaagorira/tetrisAI/issues/22)に対応しています。

## 概要

戦略的学習モードは、既存の`PatternInferenceAgent`に戦略的思考機能を追加し、AIが以下のことを可能にします：
- 異なる戦略を**いつ**使うべきかを学習（メタレベル学習）
- 各戦略を**どのように**効果的に実行するかを学習（行動レベル学習）
- ゲーム状態に基づいて、攻撃と防御を動的に切り替え
- 初心者から上級者の対戦相手まで、段階的に進歩

## アーキテクチャ

### 階層的学習システム

```
┌─────────────────────────────────────────────┐
│     StrategySelector (Q学習)                │
│     どの戦略を使うかを選択                    │
└────────────────┬────────────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
    ┌────▼─────┐    ┌────▼─────┐    ...
    │戦略1     │    │戦略2     │    (6戦略)
    │評価器    │    │評価器    │
    └────┬─────┘    └────┬─────┘
         │                │
    ┌────▼─────────────────▼─────┐
    │  PatternInferenceAgent      │
    │  具体的な手を選択             │
    └─────────────────────────────┘
```

### 主要コンポーネント

#### 1. **LearnableStrategicAgent** (`src/ai/learnable_strategic_agent.ts`)

戦略選択と行動学習を組み合わせたメインエージェント：
- **戦略選択**: Q学習を使用して6つの戦略から選択
- **行動選択**: 線形評価器（戦略ごとに1つ）を使用して手を選択
- **パフォーマンス追跡**: 各戦略の成功を監視
- **対戦モード**: 競技プレイのために相手の状態を組み込む

#### 2. **StrategySelector** (`src/ai/strategy_selector.ts`)

Q学習ベースのメタレベル意思決定者：
- すべての戦略選択に対してQ(状態, 戦略)を維持
- ε-greedy探索を使用（εは0.3 → 0.05に減衰）
- 時間的差分学習による更新
- 保存/読み込み可能

#### 3. **戦略的特徴** (`src/ai/features_strategic.ts`)

戦略的意思決定のための拡張特徴空間：
- **戦略履歴**: 期間、切り替え、成功指標
- **機会特徴**: T-Spin、コンボ、PC、4-wide可能性
- **対戦特徴**: 相対的優位性、相手の脆弱性、テンポコントロール

#### 4. **戦略的報酬** (`src/training/strategic_reward.ts`)

多成分報酬システム：

| 成分 | 目的 | 重み |
|------|------|------|
| 行動報酬 | 即時スコア/進行 | ベース |
| 戦略目標報酬 | 戦略固有の目標 | +可変 |
| 対戦報酬 | 競技ダイナミクス | +50-200 |
| 多様性ボーナス | 探索を促進 | ±5-10 |
| 終了報酬 | 勝敗結果 | ±1000 |

#### 5. **カリキュラム学習** (`src/training/curriculum.ts`)

段階的難易度ステージ：

| ステージ | 対戦相手の戦略 | 必要勝率 | 最小エピソード |
|---------|---------------|---------|--------------|
| 初心者 | テンポ遅延 | 70% | 100 |
| 中級者 | テンポ + 防御 | 65% | 150 |
| 中上級 | B2B + 防御 + チーズ | 60% | 200 |
| 上級者 | B2B + 4-Wide + チーズ + PC | 55% | 300 |
| エキスパート | 全6戦略 | 50% | 500 |

## 使用方法

### トレーニング

```typescript
import { runStrategicVersusTraining } from './training/strategic_versus_engine';

const result = runStrategicVersusTraining({
  totalEpisodes: 1000,
  useCurriculum: true,
  actionLearningRate: 0.001,
  strategyLearningRate: 0.01,
  gamma: 0.95,
  verbose: true,
});

console.log(`最終勝率: ${result.finalStats.p1WinRate * 100}%`);
```

### エージェントの保存/読み込み

```typescript
import { LearnableStrategicAgent } from './ai/learnable_strategic_agent';
import fs from 'fs';

// 保存
const agent = new LearnableStrategicAgent();
const data = agent.toJSON();
fs.writeFileSync('agent.json', JSON.stringify(data, null, 2));

// 読み込み
const loadedAgent = new LearnableStrategicAgent();
const savedData = JSON.parse(fs.readFileSync('agent.json', 'utf-8'));
loadedAgent.fromJSON(savedData);
```

### パフォーマンス分析

```typescript
const tracker = agent.getPerformanceTracker();
const performance = tracker.getAllPerformance();

for (const [strategy, stats] of performance) {
  console.log(`${strategy}:
    勝率: ${(stats.winRate * 100).toFixed(1)}%
    平均スコア: ${stats.averageScore.toFixed(0)}
    平均ガベージ: ${stats.averageGarbageSent.toFixed(1)}
  `);
}
```

## 設定

### 環境変数

```bash
# GPU設定（将来のニューラルネットワークサポート用）
export TETRIS_AI_GPU_BACKEND=cuda        # cuda, rocm, metal, cpu
export TETRIS_AI_GPU_DEVICE_ID=0         # GPUデバイスID
export TETRIS_AI_GPU_BATCH_SIZE=64       # トレーニングバッチサイズ
export TETRIS_AI_GPU_MEMORY_FRACTION=0.8 # 使用する最大GPUメモリ

# トレーニング設定
export TETRIS_AI_EPISODES=1000           # 総トレーニングエピソード
export TETRIS_AI_ACTION_LR=0.001         # 行動レベル学習率
export TETRIS_AI_STRATEGY_LR=0.01        # 戦略レベル学習率
export TETRIS_AI_GAMMA=0.95              # 割引率
```

### コード設定

```typescript
const config = {
  actionExplorationRate: 0.1,      // 手選択のためのε
  strategyExplorationRate: 0.3,    // 戦略選択のためのε
  actionLearningRate: 0.001,       // 手の学習率
  strategyLearningRate: 0.01,      // 戦略の学習率
  gamma: 0.95,                     // 将来の報酬を割引
  enableHold: true,                // ホールドピースを許可
  versusMode: true,                // 対戦機能を有効化
};

const agent = new LearnableStrategicAgent(config);
```

## 戦略タイプ

### 1. B2Bプレッシャー (`B2B_PRESSURE`)
- **目標**: バックトゥバックチェーンの維持（Tetris → T-Spin → Tetris）
- **使用時期**: 安定したピース供給があり、最大のガベージ出力が必要な時
- **主要特徴**: `b2bSustainability`, `tspin_availability`

### 2. 防御＆キャンセル (`DEFENSE_CANCEL`)
- **目標**: 受信ガベージをキャンセルし、ボードの高さを下げる
- **使用時期**: 重い攻撃を受けているか、ボードが危険なほど高い時
- **主要特徴**: `incoming_garbage`, `garbage_threat`, `downstack_urgency`

### 3. パーフェクトクリア (`PC_UTILIZATION`)
- **目標**: ボード全体をクリアして大量のポイントを獲得
- **使用時期**: ボードが低く（≤6行）かつクリーン（0穴）な時
- **主要特徴**: `pc_feasibility`, `max_height`

### 4. 4-Wideドミナンス (`FOUR_WIDE_DOMINANCE`)
- **目標**: 4-wideコンボ攻撃の構築と維持
- **使用時期**: ボードが低〜中程度の高さで平坦な表面の時
- **主要特徴**: `combo_potential`, `four_wide_potential`

### 5. チーズファーミング (`CHEESE_FARMING`)
- **目標**: 相手に送るガベージを最大化
- **使用時期**: 相手が脆弱（ボードが高い）な時
- **主要特徴**: `opponent_vulnerability`, `strategic_pressure`

### 6. テンポ遅延 (`TEMPO_DELAY`)
- **目標**: 安全で保守的なプレイでテンポをコントロール
- **使用時期**: 優位性があり、それを安全に維持したい時
- **主要特徴**: `tempo_control`, `relative_advantage`

## 学習アルゴリズム

### 行動レベル学習（モンテカルロ法）

各戦略の評価器について：
```
各エピソードについて:
  軌跡を収集: (s₀, a₀, r₀), (s₁, a₁, r₁), ..., (sₜ, aₜ, rₜ)

  各時刻t（逆順）について:
    Gₜ = rₜ + γ·rₜ₊₁ + γ²·rₜ₊₂ + ... (割引リターン)

    重みを更新:
      error = Gₜ - V(sₜ; θ)
      θ ← θ + α·error·∇V(sₜ; θ)
```

### 戦略レベル学習（Q学習）

戦略セレクターについて：
```
各決定について:
  Q(s, ·)に対するε-greedy方策を使用して戦略aを選択

  行動完了後:
    報酬rと次状態s'を観察

    Q値を更新:
      target = r + γ·max_a' Q(s', a')
      error = target - Q(s, a)
      Q(s, a) ← Q(s, a) + α·error·∇Q(s, a)
```

## パフォーマンスベンチマーク

### 期待される学習曲線

| エピソード | 勝率 | 平均スコア | 戦略多様性 |
|-----------|------|-----------|-----------|
| 0-100 | 30-40% | 5,000 | 2-3戦略 |
| 100-300 | 50-60% | 15,000 | 3-4戦略 |
| 300-600 | 60-70% | 25,000 | 4-5戦略 |
| 600-1000 | 70-80% | 35,000 | 5-6戦略 |

### 計算要件

- **CPUベーストレーニング**: 約1エピソード/秒（シングルスレッド）
- **並列トレーニング**: 約10-50エピソード/秒（コア数に依存）
- **メモリ使用量**: 約500 MB（エピソード履歴とともに増加）
- **ストレージ**: 保存されたエージェントモデルあたり約1 MB

## 将来の機能拡張

### 短期（計画済み）
- [ ] トレーニング可視化のためのGUIダッシュボード
- [ ] リアルタイム戦略切り替え可視化
- [ ] CSV/JSONへのテレメトリーエクスポート
- [ ] エージェント比較のためのA/Bテストフレームワーク

### 中期（研究）
- [ ] ニューラルネットワーク評価器（線形を置換）
- [ ] バッチトレーニングのためのGPU加速
- [ ] マルチエージェント自己対戦トーナメント
- [ ] ゲームモード間の転移学習

### 長期（実験的）
- [ ] Transformerベースのシーケンスモデリング
- [ ] 人間のフィードバックからの強化学習
- [ ] 戦略決定のための説明可能AI
- [ ] ライブプレイ中のオンライン学習

## トラブルシューティング

### エージェントが学習しない / 勝率が停滞

**考えられる原因**:
- 学習率が高すぎる（不安定）または低すぎる（学習が遅い）
- 探索率が高すぎる（ランダムすぎる）または低すぎる（探索不足）
- カリキュラムが難しすぎる（簡単なステージにスキップ）

**解決策**:
```typescript
// 学習率を下げる
agent.getConfig().actionLearningRate = 0.0001;
agent.getConfig().strategyLearningRate = 0.001;

// 探索を調整
agent.setExplorationRates(0.05, 0.1); // (行動, 戦略)

// カリキュラムステージをスキップ
curriculumProgress.skipToStage(0); // 初心者に戻る
```

### エージェントが1つの戦略に過剰適応

**原因**: 多様性ボーナスまたは探索が不十分

**解決策**:
```typescript
// 多様性の重みを増やす
// （strategic_reward.ts:computeDiversityBonusを修正）

// 戦略探索を増やす
agent.getConfig().strategyExplorationRate = 0.3;
```

### トレーニングが遅すぎる

**解決策**:
- `maxStepsPerEpisode`を減らす（デフォルト2000 → 1000）
- 並列ワーカーを増やす
- カリキュラムを使用（簡単なエピソードをより速くスキップ）
- ボトルネックのためにコードをプロファイル

## 参考文献

- [Issue #22: 戦略的思考の統合](https://github.com/suupaagorira/tetrisAI/issues/22)
- [Q学習論文](https://link.springer.com/article/10.1007/BF00992698)（Watkins & Dayan, 1992）
- [カリキュラム学習論文](https://ronan.collobert.com/pub/matos/2009_curriculum_icml.pdf)（Bengio et al., 2009）
- [モンテカルロRL](http://incompleteideas.net/book/the-book.html)（Sutton & Barto, 2018）

## 貢献者

- 実装: Claude (Anthropic AI)
- 設計: Issue要件と既存コードベースに基づく
- テスト: コミュニティ貢献者歓迎！

## ライセンス

メインプロジェクトと同じ（ルートLICENSEファイル参照）
