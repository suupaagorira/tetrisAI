/**
 * Analyze strategy performance example
 */

import { LearnableStrategicAgent } from '../src/ai/learnable_strategic_agent.js';
import { STRATEGIES } from '../src/ai/strategy.js';
import fs from 'fs';

// Check if trained agent file exists
if (!fs.existsSync('trained_agent.json')) {
  console.error('Error: trained_agent.json not found!');
  console.log('Please run train_strategic.ts first to create a trained agent.');
  process.exit(1);
}

// Load trained agent
const agent = new LearnableStrategicAgent();
const data = JSON.parse(fs.readFileSync('trained_agent.json', 'utf-8'));
agent.fromJSON(data);

// Get performance stats
const tracker = agent.getPerformanceTracker();
const performance = tracker.getAllPerformance();

console.log('\n=== Strategy Performance Analysis ===\n');

let hasUsedStrategies = false;

for (const [strategy, stats] of performance) {
  if (stats.timesUsed > 0) {
    hasUsedStrategies = true;
    const strategyConfig = STRATEGIES.get(strategy);
    const strategyName = strategyConfig?.name || strategy;
    console.log(`${strategyName} (${strategy}):`);
    console.log(`  Times Used: ${stats.timesUsed}`);
    console.log(`  Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  Avg Score: ${stats.averageScore.toFixed(0)}`);
    console.log(`  Avg Garbage: ${stats.averageGarbageSent.toFixed(1)}`);
    console.log(`  Avg Reward: ${stats.averageReward.toFixed(1)}`);
    console.log('');
  }
}

if (!hasUsedStrategies) {
  console.log('No strategy usage data found.');
  console.log('This might be because the agent was not trained long enough.');
}

// Get best strategy
const bestStrategy = tracker.getBestStrategy();
const bestStrategyConfig = STRATEGIES.get(bestStrategy);
const bestStrategyName = bestStrategyConfig?.name || bestStrategy;
console.log(`Best Strategy: ${bestStrategyName} (${bestStrategy})`);

// Get strategy selector stats
const selector = agent.getStrategySelector();
console.log(`\nStrategy Selector:`);
console.log(`  Episodes: ${selector.getEpisodeCount()}`);
console.log(`  Exploration Rate: ${selector.getEpsilon().toFixed(3)}`);

console.log('\n✓ Analysis complete!');
