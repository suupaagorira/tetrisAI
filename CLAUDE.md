# CLAUDE.md - TetrisAI プロジェクトガイド

このドキュメントは、AIアシスタントがTetrisAIプロジェクトを理解し、効率的に作業するためのガイドラインです。

## プロジェクト概要

### 目的
パターン分岐推論型のテトリスAIを実装し、強化学習によって攻撃性能と生存能力を兼ね備えたAIエージェントを開発する。2009年版テトリスガイドライン（ワールドルール）に準拠し、ぷよぷよテトリスシリーズのような高度な攻撃能力を目指す。

### 主要な特徴
- **階層的強化学習**: 戦略選択（メタレベル）と行動選択（ベースレベル）の2段階学習
- **6つの戦略**: Offensive, Defensive, Balanced, Combo, Perfect Clear, Four-Wide
- **カリキュラム学習**: 段階的な難易度上昇による効率的なトレーニング
- **対戦モード**: 2人対戦でのAI学習と評価
- **Webベースのトレーニング可視化**: Express + WebSocketを使用したGUIインターフェース

## プロジェクト構造

```
tetrisAI/
├── src/
│   ├── core/          # ゲームロジックの中核
│   │   ├── game.ts    # TetrisGameクラス（ゲーム状態管理）
│   │   ├── board.ts   # 盤面管理
│   │   ├── pieces.ts  # テトリミノの定義とSRS回転
│   │   ├── bag.ts     # 7バッグランダマイザー
│   │   └── types.ts   # 型定義
│   │
│   ├── ai/            # AIエージェントとアルゴリズム
│   │   ├── agent.ts              # 基本AIエージェント
│   │   ├── strategic_agent.ts    # 戦略的AIエージェント（推論のみ）
│   │   ├── learnable_strategic_agent.ts  # 学習可能な戦略的AIエージェント ★重要
│   │   ├── strategy_selector.ts  # Q学習による戦略選択 ★重要
│   │   ├── evaluator.ts          # 線形評価関数
│   │   ├── features.ts           # 基本的な特徴抽出
│   │   ├── features_extended.ts  # 拡張特徴
│   │   ├── features_strategic.ts # 戦略的特徴（対戦用） ★重要
│   │   ├── strategy.ts           # 戦略の定義
│   │   ├── strategy_performance.ts # 戦略パフォーマンス追跡 ★重要
│   │   ├── triggers.ts           # 戦略トリガー
│   │   ├── beam_search.ts        # ビームサーチ実装
│   │   └── telemetry.ts          # テレメトリー収集
│   │
│   ├── training/      # トレーニングエンジン
│   │   ├── strategic_versus_engine.ts  # 戦略的対戦トレーニング ★重要
│   │   ├── strategic_reward.ts   # 多成分報酬システム ★重要
│   │   ├── curriculum.ts         # カリキュラム学習 ★重要
│   │   ├── versus_engine.ts      # 基本的な対戦エンジン
│   │   ├── versus_trainer.ts     # 対戦トレーナー
│   │   ├── offline_trainer.ts    # オフライントレーナー
│   │   ├── engine.ts             # 基本トレーニングエンジン
│   │   └── common.ts             # 共通ユーティリティ
│   │
│   ├── versus/        # 対戦環境
│   │   └── environment.ts        # 対戦環境の実装
│   │
│   ├── gui/           # Webベースのトレーニング可視化
│   │   ├── server.ts             # Expressサーバー
│   │   ├── client.ts             # クライアントサイドJS
│   │   ├── versus_client.ts      # 対戦モードクライアント
│   │   ├── strategic_client.ts   # 戦略モードクライアント
│   │   ├── strategic_training_client.ts  # 戦略トレーニングクライアント
│   │   ├── train_worker.ts       # トレーニングワーカー
│   │   └── versus_train_worker.ts  # 対戦トレーニングワーカー
│   │
│   ├── config/        # 設定
│   │   └── gpu_config.ts         # GPU設定（将来のNN用）
│   │
│   ├── cli/           # コマンドラインインターフェース
│   │   └── main.ts               # CLIエントリーポイント
│   │
│   └── examples/      # サンプルスクリプト
│       ├── train_strategic.ts
│       ├── train_strategic_simple.ts
│       ├── train_custom.ts
│       ├── analyze_performance.ts
│       └── test_game_completion.ts
│
├── docs/              # ドキュメント
│   ├── STRATEGIC_LEARNING.md           # 戦略的学習の詳細ガイド
│   ├── STRATEGIC_LEARNING_QUICKSTART.md  # クイックスタートガイド
│   ├── strategic_ai.md
│   ├── strategic_versus_gui.md
│   ├── gui.md
│   └── server_env.md
│
├── tests/             # テストコード
│   └── game.test.ts
│
├── examples/          # 実行可能なサンプル
│   └── README.md
│
├── doc.md             # プロジェクト設計書（日本語）
├── STRATEGIC_LEARNING_IMPLEMENTATION.md  # Issue #22実装サマリー
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

## 技術スタック

### 言語とランタイム
- **TypeScript 5.9.3**: 型安全性と開発効率
- **Node.js**: ランタイム環境
- **CommonJS**: モジュールシステム（tsconfig.jsonで設定）

### 主要な依存関係
- **express**: Webサーバー（GUI用）
- **dotenv**: 環境変数管理
- **tsx**: TypeScript実行
- **vitest**: テストフレームワーク

### ビルドと開発ツール
- **TypeScript Compiler (tsc)**: ビルドツール
- **esbuild**: 高速ビルドツール（GUIで使用）
- **strict モード**: 厳密な型チェック有効

## アーキテクチャの重要ポイント

### 1. 階層的強化学習システム

#### メタレベル（戦略選択）
- **アルゴリズム**: Q学習
- **実装**: `StrategySelector` (src/ai/strategy_selector.ts)
- **役割**: 現在のゲーム状態に基づいて6つの戦略から最適なものを選択
- **学習パラメータ**:
  - 学習率 (α): 0.01
  - 割引率 (γ): 0.95
  - 探索率 (ε): 0.3 → 0.05 (減衰)

#### ベースレベル（行動選択）
- **アルゴリズム**: 線形関数近似を使用したモンテカルロ法
- **実装**: 戦略ごとの `Evaluator` (src/ai/evaluator.ts)
- **役割**: 選択された戦略に基づいて具体的なミノの配置を決定
- **学習パラメータ**:
  - 学習率 (α): 0.001
  - 割引率 (γ): 0.95
  - 探索率 (ε): 0.1 (一定)

### 2. 主要コンポーネントの関係

```
TetrisGame (ゲームロジック)
    ↓
LearnableStrategicAgent (学習可能な戦略的AIエージェント)
    ├── StrategySelector (戦略選択)
    │   └── Q学習によるメタレベル意思決定
    └── 6つのEvaluator (行動選択)
        └── 戦略ごとの線形評価関数
    ↓
StrategicVersusEngine (トレーニングエンジン)
    ├── StrategicReward (報酬計算)
    ├── Curriculum (カリキュラム学習)
    └── StrategyPerformance (パフォーマンス追跡)
```

### 3. 戦略の種類と特性

1. **Offensive（攻撃型）**: 高火力を優先、リスクを取る
2. **Defensive（防御型）**: 安全性重視、高さを抑える
3. **Balanced（バランス型）**: 攻守のバランス
4. **Combo（コンボ型）**: REN連続消しを狙う
5. **Perfect Clear（パフェ型）**: 完全消去を目指す
6. **Four-Wide（4列積み型）**: 4列積みからの連続攻撃

### 4. 特徴抽出システム

#### 基本特徴 (features.ts)
- 盤面の高さ、穴の数、凹凸など基本的な評価指標（約8-10特徴）

#### 拡張特徴 (features_extended.ts)
- より詳細な盤面分析（Tスピン機会、コンボ可能性など）

#### 戦略的特徴 (features_strategic.ts) ★重要
- **戦略履歴**: 戦略の継続時間、切り替え回数、成功率
- **機会検出**: Tスピン、コンボ、パフェ、4列積み、B2B、ダウンスタックの可能性
- **対戦ダイナミクス**: 相手との優位性、脆弱性、テンポ、プレッシャー、ガベージ脅威、高さ優位、整地度優位

### 5. 報酬設計 (strategic_reward.ts)

多成分報酬システム：
- **行動報酬**: スコア増加、ライン消去、コンボ (+10-100)
- **戦略目標報酬**: 戦略固有の目標達成 (+20-500)
- **対戦報酬**: 送出/キャンセルしたガベージ、優位性 (+30-200)
- **多様性ボーナス**: 戦略探索を促進 (±5-10)
- **終了報酬**: 勝敗結果 (±1000)

## 開発時の重要な考慮事項

### 1. 型安全性

**厳格なTypeScript設定**
- `strict: true`: 厳密な型チェック
- `noUncheckedIndexedAccess: true`: 配列/オブジェクトアクセスの安全性
- `exactOptionalPropertyTypes: true`: オプショナルプロパティの厳密性

**型定義の一貫性**
- `src/core/types.ts`にゲームの基本型を集約
- すべてのコンポーネントで型を明示的に定義
- `any`型の使用を避ける

### 2. ゲームロジックの不変性

**TetrisGameクラスの特性**
- ゲームの状態変更は必ずTetrisGameのメソッド経由
- AIは`clone()`でゲームをコピーしてシミュレーション
- 元のゲーム状態を破壊しない

**重要メソッド**
```typescript
// ゲームのコピー（シミュレーション用）
clone(): TetrisGame

// ミノの配置（メイン操作）
placeAt(x: number, rotation: Rotation): boolean

// ホールド操作
hold(): boolean

// 状態取得
getBoard(): Cell[][]
stats(): GameStats
isGameOver(): boolean
```

### 3. 並列処理とパフォーマンス

**現在の実装**
- シングルスレッドで動作
- ゲームシミュレーションは軽量（1エピソード/秒程度）

**将来の拡張性**
- `gpu_config.ts`でGPU対応を準備
- 並列トレーニングのインフラは実装済み（`train_worker.ts`）
- ニューラルネットワークへの移行を想定

### 4. 学習データの管理

**保存形式**
- JSON形式でエージェントをシリアライズ
- `LearnableStrategicAgent.toJSON()` / `fromJSON()`
- すべての学習状態（Q値、評価器の重み）を含む

**推奨の保存場所**
- 訓練済みエージェント: プロジェクトルートに保存
- `.gitignore`で`*.json`（package.json等を除く）は除外設定済み

### 5. ビルドとテスト

**ビルドコマンド**
```bash
npm run build        # TypeScriptをコンパイル (dist/)
npm run lint         # 型チェックのみ（エラー検出）
```

**実行コマンド**
```bash
npm start            # CLIモード起動
npm run start:versus # 対戦モード起動
npm run start:strategic  # 戦略的対戦デモ
npm run gui          # GUI付きトレーニング起動
npm run gui:watch    # GUI自動リロード開発モード
npm test             # テスト実行
```

**重要なファイルパス**
- ビルド出力: `dist/` (gitignore済み)
- トレーニング出力: `weights*.json`, `trained_agent.json` (gitignore済み)

### 6. GUI開発時の注意

**クライアント側の扱い**
- `src/gui/client.ts`, `versus_client.ts`, `strategic_client.ts`は**ブラウザで実行**
- tsconfig.jsonで`exclude`に設定（Node.js APIを使用しない）
- esbuildでバンドルされてブラウザに配信

**サーバー側**
- `src/gui/server.ts`がExpressサーバーを起動
- WebSocketで学習状態をリアルタイム配信
- ポート: 環境変数`PORT`または3000

### 7. カリキュラム学習の進行

**5段階のステージ**
1. **Beginner**: 基礎的な操作
2. **Intermediate**: 戦略の理解
3. **Advanced**: 複雑な戦術
4. **Expert**: 高度な競技プレイ
5. **Master**: 人間の上級者レベル

**自動進級**
- 勝率が閾値（60-70%）を超えると次のステージへ
- ステージごとに対戦相手の難易度が上昇
- `Curriculum.checkProgress()` で進捗確認

### 8. デバッグとテレメトリー

**テレメトリーシステム**
- `src/ai/telemetry.ts`: ゲームプレイの詳細記録
- 戦略選択、配置決定、報酬を記録
- パフォーマンス分析に使用

**ログ出力**
- `verbose: true`オプションでトレーニング進捗を出力
- エピソードごとの統計を表示
- 戦略選択の頻度と成功率を追跡

### 9. コーディング規約

**命名規則**
- クラス: PascalCase (`TetrisGame`, `LearnableStrategicAgent`)
- 関数/変数: camelCase (`decide`, `currentStrategy`)
- 定数: UPPER_SNAKE_CASE (`SPAWN_X`, `SCORE_TABLE`)
- ファイル: snake_case (`strategic_versus_engine.ts`)

**ファイル構成**
- 1ファイル1主要クラスまたは1機能
- 型定義は`types.ts`に集約
- ユーティリティ関数は対応するモジュール内に配置

**インポート順序**
1. 標準ライブラリ（fs, pathなど）
2. 外部パッケージ（express, dotenvなど）
3. 内部モジュール（./core, ./aiなど）

### 10. テストとバリデーション

**現在のテスト**
- `tests/game.test.ts`: TetrisGameの基本動作
- vitest使用

**テストが必要な領域**
- AIエージェントの決定ロジック
- 報酬計算の正確性
- 戦略選択の妥当性
- カリキュラム進行の動作
- エピソード終了時のデータ保存

**テストの実行**
```bash
npm test           # 全テスト実行
npm run test:watch # 監視モード（未実装）
```

## よくある問題と解決策

### 1. ビルドエラー

**問題**: `tsc`でコンパイルエラー
**原因**: 型の不整合、未定義の変数
**解決**:
- `npm run lint`で型エラーを確認
- strict modeに準拠した型定義を追加
- `any`型を避け、適切な型アノテーションを使用

### 2. トレーニングが進まない

**問題**: AIの勝率が上がらない
**原因**:
- 学習率が不適切
- 報酬設計に問題
- 探索が不足

**解決**:
- カリキュラム学習を使用（段階的な難易度上昇）
- `verbose: true`でログを確認
- 探索率（ε）を調整

### 3. GUIが起動しない

**問題**: `npm run gui`でエラー
**原因**:
- ポート競合（3000番が使用中）
- ビルドが必要（client.jsが未生成）

**解決**:
- 環境変数`PORT`で別ポートを指定
- esbuildでクライアントコードをビルド
- `server.ts`のエラーログを確認

### 4. 学習データの保存/読込に失敗

**問題**: エージェントのシリアライズエラー
**原因**:
- JSONに変換できないオブジェクト
- ファイルパスの問題

**解決**:
- `toJSON()`が完全な状態を含むか確認
- ファイルパスは絶対パスを使用
- エラーメッセージから欠落しているフィールドを特定

## 今後の拡張計画

### フェーズ3（短期）
- [ ] GUI統合の完成（戦略的トレーニング用エンドポイント）
- [ ] リアルタイムテレメトリーダッシュボード
- [ ] 戦略可視化ウィジェット
- [ ] CSVエクスポート機能

### フェーズ4（中期）
- [ ] 線形評価器をニューラルネットワークに置換
- [ ] GPU加速（CUDA/ROCm/Metal対応）
- [ ] マルチエージェント自己対戦トーナメント
- [ ] ハイパーパラメータ自動チューニング

### フェーズ5（長期）
- [ ] Transformerベースのシーケンスモデル
- [ ] 人間のフィードバックからの強化学習（RLHF）
- [ ] 説明可能AI（XAI）機能
- [ ] オンライン学習（ライブゲームプレイ中）

## 参考ドキュメント

### 内部ドキュメント
1. **doc.md**: プロジェクト全体の設計書（日本語、詳細なアーキテクチャ説明）
2. **STRATEGIC_LEARNING.md**: 戦略的学習システムの完全ガイド
3. **STRATEGIC_LEARNING_QUICKSTART.md**: 5分で始める戦略的学習
4. **STRATEGIC_LEARNING_IMPLEMENTATION.md**: Issue #22の実装サマリー
5. **examples/README.md**: サンプルスクリプトの使い方

### 重要なコード参照
- ゲームロジック: `src/core/game.ts:84` (TetrisGameクラス)
- 戦略的AIエージェント: `src/ai/learnable_strategic_agent.ts:25`
- Q学習戦略選択: `src/ai/strategy_selector.ts:45`
- 報酬計算: `src/training/strategic_reward.ts:30`
- カリキュラム学習: `src/training/curriculum.ts:40`
- トレーニングエンジン: `src/training/strategic_versus_engine.ts:50`

### 外部参考資料
- テトリスガイドライン: [Tetris Wiki](https://tetris.wiki/)
- 強化学習: Sutton & Barto "Reinforcement Learning: An Introduction"
- Q学習: Watkins, C.J.C.H. (1989)
- 階層的強化学習: Dietterich, T.G. (2000)

## 修正履歴

| 日付 | バージョン | 変更内容 |
|------|----------|---------|
| 2025-11-02 | 1.0.0 | 初版作成 |

---

**注意**: このドキュメントはAIアシスタント（Claude）がプロジェクトを理解し、効率的に作業するためのガイドラインです。人間の開発者向けのドキュメントは `doc.md` や `docs/` ディレクトリを参照してください。
