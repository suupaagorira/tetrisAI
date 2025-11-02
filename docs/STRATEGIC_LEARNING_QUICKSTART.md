# Strategic Learning Quick Start Guide

Get started with strategic learning in under 5 minutes!

## Installation

No additional dependencies required - everything is included in the main project.

```bash
# Ensure you have the latest code
git pull origin main

# Install dependencies (if not already done)
npm install

# Build the project
npm run build
```

## Basic Training Example

### 1. Simple Training Session

Create a file `examples/train_strategic.ts`:

```typescript
import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine';

console.log('Starting strategic learning training...\n');

const result = runStrategicVersusTraining({
  totalEpisodes: 100,           // Start small for testing
  maxStepsPerEpisode: 1000,     // Shorter episodes for speed
  useCurriculum: true,          // Enable progressive difficulty
  verbose: true,                // Show progress
});

console.log('\n=== Training Complete ===');
console.log(`Total Episodes: ${result.episodes.length}`);
console.log(`Win Rate: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
console.log(`Average Score: ${result.finalStats.avgP1Score.toFixed(0)}`);
console.log(`\nWins: ${result.winCounts.p1}`);
console.log(`Losses: ${result.winCounts.p2}`);
console.log(`Ties: ${result.winCounts.ties}`);

// Save the trained agent
import fs from 'fs';
const agentData = result.learningAgent.toJSON();
fs.writeFileSync('trained_agent.json', JSON.stringify(agentData, null, 2));
console.log('\n✓ Agent saved to trained_agent.json');
```

### 2. Run It

```bash
npx tsx examples/train_strategic.ts
```

You should see output like:

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

## Understanding the Output

### Training Progress

- **Episode**: Current episode number
- **Recent win rate**: Win rate over last 50 episodes
- **Stage**: Current curriculum difficulty level
- **ε_action**: Exploration rate for move selection (lower = more deterministic)
- **ε_strategy**: Exploration rate for strategy selection

### Final Statistics

- **Win Rate**: Percentage of games won against opponents
- **Average Score**: Mean score across all episodes
- **Wins/Losses/Ties**: Game outcomes

## Analyzing Performance

### View Strategy Performance

```typescript
import { LearnableStrategicAgent } from '../src/ai/learnable_strategic_agent';
import fs from 'fs';

// Load trained agent
const agent = new LearnableStrategicAgent();
const data = JSON.parse(fs.readFileSync('trained_agent.json', 'utf-8'));
agent.fromJSON(data);

// Get performance stats
const tracker = agent.getPerformanceTracker();
const performance = tracker.getAllPerformance();

console.log('\n=== Strategy Performance ===\n');

for (const [strategy, stats] of performance) {
  if (stats.timesUsed > 0) {
    console.log(`${strategy}:`);
    console.log(`  Times Used: ${stats.timesUsed}`);
    console.log(`  Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  Avg Score: ${stats.averageScore.toFixed(0)}`);
    console.log(`  Avg Garbage: ${stats.averageGarbageSent.toFixed(1)}`);
    console.log(`  Avg Reward: ${stats.averageReward.toFixed(1)}`);
    console.log('');
  }
}
```

Example output:

```
=== Strategy Performance ===

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

CHEESE_FARMING:
  Times Used: 63
  Win Rate: 71.2%
  Avg Score: 21543
  Avg Garbage: 15.8
  Avg Reward: 312.1
```

## Advanced Usage

### Custom Training Configuration

```typescript
const result = runStrategicVersusTraining({
  // Training duration
  totalEpisodes: 500,
  maxStepsPerEpisode: 2000,

  // Learning parameters
  actionLearningRate: 0.001,      // How fast to learn moves
  strategyLearningRate: 0.01,     // How fast to learn strategies
  gamma: 0.95,                    // Discount future rewards

  // Exploration
  initialActionExploration: 0.1,   // Random move chance
  initialStrategyExploration: 0.3, // Random strategy chance

  // Curriculum
  useCurriculum: true,            // Progressive difficulty

  // Misc
  seedBase: Date.now(),           // Random seed
  verbose: true,                  // Logging
  saveInterval: 100,              // Save every N episodes
});
```

### GPU Acceleration (Future)

```typescript
import { initializeGPU } from '../src/config/gpu_config';

// Initialize GPU
const gpuInit = initializeGPU({
  backend: 'cuda',  // or 'rocm', 'metal', 'cpu'
  deviceId: 0,
  batchSize: 64,
  memoryFraction: 0.8,
});

console.log(gpuInit.message);
// "Initialized CUDA backend on device 0"
```

*Note: GPU acceleration is currently a placeholder for future neural network support.*

### Resume Training

```typescript
import { LearnableStrategicAgent } from '../src/ai/learnable_strategic_agent';
import { CurriculumProgress } from '../src/training/curriculum';
import fs from 'fs';

// Load previous agent and curriculum
const agent = new LearnableStrategicAgent();
agent.fromJSON(JSON.parse(fs.readFileSync('trained_agent.json', 'utf-8')));

const curriculum = new CurriculumProgress();
curriculum.fromJSON(JSON.parse(fs.readFileSync('curriculum.json', 'utf-8')));

// Continue training...
// (would need to modify training loop to accept pre-trained agent)
```

## Curriculum Stages

The agent will automatically progress through these stages:

| Stage | Opponent Difficulty | Target Win Rate |
|-------|---------------------|-----------------|
| 🟢 Novice | Very Easy | 70% |
| 🟡 Beginner | Easy | 65% |
| 🟠 Intermediate | Medium | 60% |
| 🔴 Advanced | Hard | 55% |
| ⚫ Expert | Very Hard | 50% |

The agent advances when it achieves the target win rate and completes minimum episodes.

## Tips for Best Results

### 1. Start Small

```typescript
// Good for initial testing
totalEpisodes: 100,
maxStepsPerEpisode: 1000,
```

### 2. Use Curriculum

```typescript
// Highly recommended
useCurriculum: true,
```

Curriculum learning helps the agent learn faster by starting with easy opponents.

### 3. Monitor Exploration Rates

If win rate plateaus, check exploration:

```typescript
console.log(`Action ε: ${agent.getConfig().actionExplorationRate}`);
console.log(`Strategy ε: ${agent.getStrategySelector().getEpsilon()}`);
```

Too high = too random. Too low = no exploration.

### 4. Save Checkpoints

```typescript
// Save every 100 episodes
if (episodeNum % 100 === 0) {
  fs.writeFileSync(
    `agent_episode_${episodeNum}.json`,
    JSON.stringify(agent.toJSON(), null, 2)
  );
}
```

### 5. Analyze Strategy Usage

Look for imbalanced strategy usage:

```typescript
const stats = tracker.getAllPerformance();
const usageCounts = Array.from(stats.values()).map(s => s.timesUsed);
const maxUsage = Math.max(...usageCounts);
const minUsage = Math.min(...usageCounts.filter(c => c > 0));

if (maxUsage / minUsage > 10) {
  console.warn('⚠️  Strategy usage is very imbalanced');
  console.log('Consider increasing strategy exploration');
}
```

## Common Issues

### "Win rate not improving"

**Cause**: Learning rates may be too high or low

**Fix**:
```typescript
actionLearningRate: 0.0005,    // Try halving
strategyLearningRate: 0.005,   // Try halving
```

### "Agent uses only one strategy"

**Cause**: Insufficient exploration

**Fix**:
```typescript
initialStrategyExploration: 0.5,  // Increase from 0.3
```

### "Training very slow"

**Cause**: Episodes too long or too many

**Fix**:
```typescript
maxStepsPerEpisode: 500,     // Reduce from 2000
totalEpisodes: 200,          // Start smaller
```

### "Out of memory"

**Cause**: Too much episode history stored

**Fix**: Clear history periodically:
```typescript
if (episodeNum % 100 === 0) {
  agent.clearDecisionHistory();
}
```

## Next Steps

1. **Read the full documentation**: `docs/STRATEGIC_LEARNING.md`
2. **Experiment with parameters**: Try different learning rates and exploration
3. **Visualize training**: Plot win rates over episodes
4. **Compare agents**: Train multiple agents with different settings
5. **Contribute**: Share your findings and improvements!

## Example: Complete Training Script

```typescript
import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine';
import fs from 'fs';

async function main() {
  console.log('🎮 TetrisAI Strategic Learning\n');

  const result = runStrategicVersusTraining({
    totalEpisodes: 500,
    useCurriculum: true,
    verbose: true,
  });

  // Save results
  fs.writeFileSync('agent.json', JSON.stringify(result.learningAgent.toJSON(), null, 2));

  if (result.curriculumProgress) {
    fs.writeFileSync('curriculum.json', JSON.stringify(result.curriculumProgress.toJSON(), null, 2));
  }

  // Summary
  console.log('\n📊 Training Summary:');
  console.log(`Episodes: ${result.episodes.length}`);
  console.log(`Win Rate: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
  console.log(`Avg Score: ${result.finalStats.avgP1Score.toFixed(0)}`);

  if (result.curriculumProgress) {
    const stats = result.curriculumProgress.getStats();
    console.log(`Final Stage: ${stats.currentStage}`);
    console.log(`Overall Progress: ${(stats.overallProgress * 100).toFixed(1)}%`);
  }

  console.log('\n✅ Training complete!');
}

main().catch(console.error);
```

Happy training! 🚀
