# Strategic AI System Documentation

## Overview

The Strategic AI system implements a comprehensive competitive Tetris AI with four integrated layers:

- **S-system (Strategy Layer)**: High-level strategic approaches
- **T-system (Template Layer)**: Tactical move templates
- **F-system (Feature Extraction)**: Enhanced feature analysis
- **G-system (Switch Triggers)**: Strategy switching logic

## Architecture

```
Game State
    ↓
[Feature Extraction (F-system)]
    ↓
[Trigger Evaluation (G-system)] → Strategy Switch?
    ↓
[Strategy Selection (S-system)]
    ↓
[Template Selection (T-system)]
    ↓
[Beam Search with Combined Weights]
    ↓
[Best Move + Telemetry]
```

## Strategy Layer (S-system)

### Available Strategies

1. **S1: B2B Pressure** (`StrategyType.B2B_PRESSURE`)
   - Maintain back-to-back chains with Tetris and T-Spins
   - Focus on sustained attack pressure
   - Beam width: 8

2. **S2: Defense & Cancel** (`StrategyType.DEFENSE_CANCEL`)
   - Prioritize quick line clears to cancel incoming garbage
   - Keep board low and stable
   - Beam width: 6 (faster decisions)

3. **S3: PC Utilization** (`StrategyType.PC_UTILIZATION`)
   - Build towards and exploit Perfect Clear opportunities
   - Massive damage potential
   - Beam width: 10 (wider search for PC setups)

4. **S4: 4-Wide Dominance** (`StrategyType.FOURWIDE_DOMINANCE`)
   - Build and maintain 4-wide column structure
   - Sustained combo attacks
   - Beam width: 8

5. **S5: Cheese Farming** (`StrategyType.CHEESE_FARMING`)
   - Maximize garbage output through aggressive clearing
   - High-risk, high-reward approach
   - Beam width: 8

6. **S6: Tempo Delay** (`StrategyType.TEMPO_DELAY`)
   - Control game pace and wait for opponent mistakes
   - Very defensive, safe play
   - Beam width: 6

### Strategy Configuration

Each strategy defines weight multipliers for features:

```typescript
{
  linesCleared: number;
  tetris: number;
  tspin: number;
  backToBack: number;
  aggregateHeight: number;
  holes: number;
  garbageSent: number;
  // ... and more
}
```

## Template Layer (T-system)

### Available Templates

1. **T1: Emergency Clear** (`TemplateType.EMERGENCY_CLEAR`)
   - Precondition: Board height > 15
   - Goal: Clear lines and reduce height
   - Priority: 100 (highest)

2. **T2: T-Spin Setup** (`TemplateType.SETUP_TSPIN`)
   - Precondition: Height 4-16, moderate holes OK
   - Goal: Build T-Spin opportunities
   - Priority: 70

3. **T3: Build 4-Wide** (`TemplateType.BUILD_FOURWIDE`)
   - Precondition: Height < 12, clean board
   - Goal: Construct 4-wide structure
   - Priority: 60

4. **T4: Perfect Clear Setup** (`TemplateType.PERFECT_CLEAR_SETUP`)
   - Precondition: Height < 6, zero holes
   - Goal: Achieve Perfect Clear
   - Priority: 80

5. **T5: Combo Chain** (`TemplateType.COMBO_CHAIN`)
   - Precondition: Active combo
   - Goal: Maintain and extend combo
   - Priority: 75

6. **T6: Stable Downstack** (`TemplateType.STABLE_DOWNSTACK`)
   - Precondition: Any non-critical state
   - Goal: Safe board cleaning
   - Priority: 50 (default/fallback)

### Template Structure

```typescript
{
  preconditions: {
    minHeight?: number;
    maxHeight?: number;
    requireCombo?: boolean;
    // ...
  },
  goals: {
    targetLines?: number;
    maintainB2B?: boolean;
    achievePC?: boolean;
    // ...
  },
  invariants: {
    maxHeightLimit?: number;
    preserveCombo?: boolean;
    avoidGameOver: true;
    // ...
  },
  featureWeights: {
    [feature: string]: number;
  }
}
```

## Feature Extraction (F-system)

### Feature Categories

1. **Shape Metrics**
   - `aggregate_height`: Average column height
   - `max_height`: Tallest column
   - `bumpiness`: Height variation
   - `surface_roughness`: Surface deviation
   - `wells`: Deep vertical gaps

2. **Holes/Cheese Patterns**
   - `holes`: Total holes
   - `reachable_holes`: Holes within 3 blocks of surface
   - `buried_holes`: Deep unreachable holes
   - `gaps`: Single-cell gaps

3. **Spin/PC Resources**
   - `tspin_opportunity`: Detected T-Spin setups
   - `tspin`, `tspin_mini`: T-Spin execution
   - `perfect_clear`: All-clear bonus

4. **Piece Availability**
   - `has_i_piece`, `has_t_piece`: Critical pieces in queue
   - `queue_diversity`: Variety of pieces
   - `hold_available`: Can use hold

5. **Send/Receive Dynamics** (Versus mode)
   - `incoming_garbage`: Pending garbage lines
   - `outgoing_garbage`: Garbage being sent
   - `can_cancel`: Can cancel incoming garbage
   - `opponent_height`: Opponent's board height

6. **Attack Potential**
   - `attack_potential`: Ability to send garbage
   - `kill_probability`: Probability of eliminating opponent
   - `height_advantage`: Height differential

7. **Game State**
   - `combo`, `back_to_back`: Chain status
   - `lines_cleared`: Lines per move
   - `score_gain`: Points earned

## Switch Triggers (G-system)

### Trigger Types

1. **G1: Kill Window** (`TriggerType.KILL_WINDOW`)
   - Detects opponent vulnerability
   - Recommends: `CHEESE_FARMING`
   - Threshold: 70% kill probability

2. **G2: Safety Margin** (`TriggerType.SAFETY_MARGIN`)
   - Activates when board height critical
   - Recommends: `DEFENSE_CANCEL`
   - Threshold: 75% max height (15 rows)

3. **G3: B2B Status** (`TriggerType.B2B_STATUS`)
   - Activates when B2B chain active
   - Recommends: `B2B_PRESSURE`
   - Threshold: B2B active

4. **G4: Resource Depletion** (`TriggerType.RESOURCE_DEPLETION`)
   - Detects lack of critical pieces
   - Recommends: `STABLE_DOWNSTACK`
   - Threshold: 30% resource availability

5. **G5: Opponent Cancel** (`TriggerType.OPPONENT_CANCEL`)
   - Detects strong opponent pressure
   - Recommends: `DEFENSE_CANCEL`
   - Threshold: 60% pressure score

6. **G6: Dwell Time** (`TriggerType.DWELL_TIME`)
   - Forces strategy re-evaluation
   - Recommends: Rotation to next strategy
   - Threshold: 10 seconds

7. **G7: Garbage Prediction** (`TriggerType.GARBAGE_PREDICTION`)
   - Responds to incoming garbage
   - Recommends: `DEFENSE_CANCEL`
   - Threshold: 6+ incoming lines

### Hysteresis

All triggers use hysteresis to prevent oscillation:

```typescript
{
  activationThreshold: number;    // Threshold to activate
  deactivationThreshold: number;  // Threshold to deactivate
}
```

This creates a "dead zone" that prevents rapid switching.

## Beam Search

### Configuration

```typescript
{
  beamWidth: 8,           // Keep top 8 candidates
  maxDepth: 1,            // No lookahead (current implementation)
  timeLimit: 4,           // 4ms target latency
  pruneThreshold: 0.3     // Keep top 70%
}
```

### Algorithm

1. Enumerate all possible placements (40-50 candidates)
2. Simulate each placement on cloned game
3. Extract features and evaluate with combined weights
4. Sort by evaluation score
5. Keep top `beamWidth` candidates
6. Return best candidate

### Optimizations

- Early termination when time limit reached
- Quick filtering of invalid placements
- Adaptive beam width based on time budget

## Telemetry System

### Decision Telemetry

Logs every decision with:
- Strategy and template used
- Trigger that caused decision
- Evaluation score
- Performance metrics (latency, candidates evaluated)
- Game state snapshot
- Versus state (if applicable)
- Rationale text

### Strategy Switch Telemetry

Logs every strategy change with:
- From/to strategies
- Trigger that caused switch
- Confidence level
- Dwell time in previous strategy

### Performance Telemetry

Tracks:
- Decision latency
- Candidates evaluated
- Beam width used
- Feature extraction time (optional)

### Session Summary

Aggregates:
- Average, P95, P99 latency
- Strategy usage statistics
- Trigger activation counts
- Latency violations (>4ms, >8ms)
- Final game outcome

## Usage

### Basic Usage

```typescript
import { StrategicAgent } from './ai/strategic_agent';
import { TetrisGame } from './core/game';
import { Bag } from './core/bag';

// Create agent
const agent = new StrategicAgent({
  initialStrategy: StrategyType.B2B_PRESSURE,
  enableTelemetry: true,
  targetLatency: 4
});

// Create game
const bag = new Bag(12345);
const game = new TetrisGame(bag);

// Make decisions
while (!game.isGameOver()) {
  agent.act(game);
}

// Export telemetry
const summary = agent.exportSummaryJSON(game.score, game.lines);
console.log(summary);
```

### Versus Mode

```typescript
import { createVersusAgent, VersusContext } from './ai/strategic';

const agent1 = createVersusAgent();
const agent2 = createVersusAgent();

// Set versus context before each decision
const context: VersusContext = {
  opponentHeight: 0.7,
  incomingGarbage: 5,
  opponentCombo: 3
};

agent1.setVersusContext(context);
agent1.act(game1);
```

### Custom Configuration

```typescript
const agent = new StrategicAgent({
  initialStrategy: StrategyType.PC_UTILIZATION,
  enableTelemetry: true,
  targetLatency: 4,
  beamConfig: {
    beamWidth: 10,
    maxDepth: 1,
    timeLimit: 4,
    pruneThreshold: 0.2
  },
  versusMode: true
});
```

## Performance Targets

### Latency Requirements

- **Target**: 4ms per decision
- **P99 Requirement**: ≤8ms
- **Typical**: 2-5ms average

### Accuracy Requirements

- **Defensive Thresholds**: 100% accuracy
  - Must activate defense when height > 15
  - Must respond to incoming garbage > 6 lines

### Strategy Switching

- **Cooldown**: 500ms minimum between switches
- **Hysteresis**: Prevents oscillation
- **Priority**: Higher priority triggers override lower

## Telemetry Output Example

```json
{
  "sessionId": "session_1234567890_abc123",
  "totalMoves": 150,
  "averageLatency": 3.2,
  "p95Latency": 5.1,
  "p99Latency": 6.8,
  "maxLatency": 7.5,
  "strategyUsage": {
    "S1": { "count": 80, "totalDwellTime": 45000, "averageDwellTime": 562.5 },
    "S2": { "count": 40, "totalDwellTime": 25000, "averageDwellTime": 625 },
    "S5": { "count": 30, "totalDwellTime": 15000, "averageDwellTime": 500 }
  },
  "triggerCounts": {
    "G1": 5,
    "G2": 12,
    "G3": 15
  },
  "violationsAbove4ms": 25,
  "violationsAbove8ms": 0,
  "finalScore": 12500,
  "finalLines": 45,
  "won": true
}
```

## Testing

Run tests:

```bash
npm test -- src/ai/__tests__/strategic.test.ts
```

Tests cover:
- Strategy switching logic
- Template selection
- Trigger activation
- Latency requirements
- Defensive threshold accuracy
- Versus mode functionality
- Telemetry export

## Implementation Notes

### Strategy Switch Cooldown

Strategies cannot switch more frequently than once per 500ms to prevent thrashing. This is enforced by the `StrategyContext` system.

### Template Priority

Templates are checked in priority order. Higher priority templates (like Emergency Clear) override lower priority ones when their preconditions are met.

### Invariant Enforcement

Moves that violate template invariants receive a penalty of -10000, effectively eliminating them from consideration.

### Kill Probability Calculation

Uses sigmoid function:
```
P(kill) = 1 / (1 + e^(-k*(score - x0)))
```

Where:
- `k = 2` (steepness)
- `x0 = 5` (midpoint)
- `score` combines: opponent height, holes, attack potential, height advantage

## Future Enhancements

Potential improvements:
1. Multi-step lookahead (depth > 1)
2. Neural network evaluator
3. Opening book integration
4. Endgame specialization
5. Opponent modeling
6. Dynamic beam width adjustment
7. Parallel candidate evaluation

## References

- Issue #19: Original specification
- `src/ai/strategic_agent.ts`: Main agent implementation
- `src/ai/strategy.ts`: Strategy definitions
- `src/ai/template.ts`: Template definitions
- `src/ai/triggers.ts`: Trigger logic
- `src/ai/beam_search.ts`: Search algorithm
- `src/examples/strategic_versus_demo.ts`: Usage example
