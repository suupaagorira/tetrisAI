/**
 * Simple strategic training example
 *
 * This is a minimal example to verify the strategic learning system works.
 */

import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine.js';

console.log('🎮 TetrisAI Strategic Learning - Simple Test\n');

// Run a very short training session for testing
const result = runStrategicVersusTraining({
  totalEpisodes: 10,              // Just 10 episodes for testing
  maxStepsPerEpisode: 100,        // Short episodes
  useCurriculum: true,
  verbose: true,
});

console.log('\n=== Training Complete ===');
console.log(`Episodes: ${result.episodes.length}`);
console.log(`Win Rate: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
console.log(`Average Score: ${result.finalStats.avgP1Score.toFixed(0)}`);
console.log(`Wins: ${result.winCounts.p1} | Losses: ${result.winCounts.p2} | Ties: ${result.winCounts.ties}`);

console.log('\n✓ Test completed successfully!');
