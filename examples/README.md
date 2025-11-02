# Strategic Learning Examples

This directory contains working examples for the strategic learning system.

## Prerequisites

```bash
# Install dependencies
npm install

# Build the project (optional - tsx can run TypeScript directly)
npm run build
```

## Examples

### 1. Simple Test (`train_strategic_simple.ts`)

A minimal example to verify the system works.

```bash
npx tsx examples/train_strategic_simple.ts
```

**Parameters:**
- 10 episodes
- 100 max steps per episode
- Very fast (completes in seconds)

**Use case:** Quick smoke test

---

### 2. Basic Training (`train_strategic.ts`)

The main training example from the documentation.

```bash
npx tsx examples/train_strategic.ts
```

**Parameters:**
- 100 episodes
- 1000 max steps per episode
- Curriculum learning enabled
- Saves to `trained_agent.json`

**Duration:** ~5-10 minutes

**Use case:** Standard training session

---

### 3. Custom Configuration (`train_custom.ts`)

Training with custom hyperparameters.

```bash
npx tsx examples/train_custom.ts
```

**Parameters:**
- 50 episodes
- 500 max steps per episode
- Custom learning rates and exploration
- Saves to `custom_agent.json`

**Duration:** ~3-5 minutes

**Use case:** Experimentation with different settings

---

### 4. Performance Analysis (`analyze_performance.ts`)

Analyze a trained agent's strategy performance.

```bash
# First, train an agent
npx tsx examples/train_strategic.ts

# Then analyze it
npx tsx examples/analyze_performance.ts
```

**Output:**
- Per-strategy statistics (win rate, score, garbage)
- Best performing strategy
- Exploration rate

**Use case:** Understanding what the agent learned

---

## Expected Output

### Training Example Output

```
Starting strategic learning training...

[Episode 50/100] Recent win rate: 45.0% | Stage: Novice | ε_action: 0.095 | ε_strategy: 0.285
[Episode 100/100] Recent win rate: 62.0% | Stage: Beginner | ε_action: 0.090 | ε_strategy: 0.271

=== Training Complete ===
Total Episodes: 100
Win Rate: 58.0%
Average Score: 12543

Wins: 58
Losses: 40
Ties: 2

✓ Agent saved to trained_agent.json
```

### Performance Analysis Output

```
=== Strategy Performance Analysis ===

B2B_PRESSURE:
  Times Used: 145
  Win Rate: 68.5%
  Avg Score: 18432
  Avg Garbage: 12.3
  Avg Reward: 245.7

DEFENSE_CANCEL:
  Times Used: 87
  Win Rate: 52.3%
  Avg Score: 8234
  Avg Garbage: 5.1
  Avg Reward: 123.4

Best Strategy: B2B_PRESSURE

Strategy Selector:
  Episodes: 100
  Exploration Rate: 0.271

✓ Analysis complete!
```

## Troubleshooting

### "Cannot find module"

Make sure you're running from the project root:

```bash
cd /path/to/tetrisAI
npx tsx examples/train_strategic.ts
```

### "trained_agent.json not found"

For `analyze_performance.ts`, you need to train an agent first:

```bash
npx tsx examples/train_strategic.ts
npx tsx examples/analyze_performance.ts
```

### Training too slow

Reduce the number of episodes or steps:

```bash
# Edit the example file and change:
totalEpisodes: 10,        // Instead of 100
maxStepsPerEpisode: 100,  // Instead of 1000
```

### Out of memory

Reduce episode length or clear history more frequently in the code.

## Customization

You can modify any example by editing the parameters in the file:

```typescript
const result = runStrategicVersusTraining({
  totalEpisodes: 200,              // Your custom value
  maxStepsPerEpisode: 2000,        // Your custom value
  actionLearningRate: 0.0005,      // Your custom value
  // ... more options
});
```

See `docs/STRATEGIC_LEARNING.md` for all available options.

## Files Generated

After running the examples, you'll see these files in the project root:

- `trained_agent.json` - Agent from `train_strategic.ts`
- `custom_agent.json` - Agent from `train_custom.ts`

These can be loaded and used for gameplay or further training.

## Next Steps

1. **Experiment with parameters**: Try different learning rates, exploration rates
2. **Longer training**: Increase episodes to 500-1000
3. **Compare agents**: Train multiple agents with different settings
4. **Visualize**: Plot win rates over episodes
5. **Contribute**: Share your findings!

For more details, see:
- `docs/STRATEGIC_LEARNING.md` - Full documentation
- `docs/STRATEGIC_LEARNING_QUICKSTART.md` - Quick start guide
