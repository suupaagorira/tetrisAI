/**
 * Test to verify games actually complete (not all ties)
 */

import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine.js';

console.log('Testing game completion with longer episodes...\n');

const result = runStrategicVersusTraining({
  totalEpisodes: 5,
  maxStepsPerEpisode: 2000,  // Longer episodes to allow games to finish
  useCurriculum: false,       // Disable curriculum for simplicity
  verbose: false,
});

console.log('=== Results ===');
console.log(`Episodes: ${result.episodes.length}`);
console.log(`Wins: ${result.winCounts.p1}`);
console.log(`Losses: ${result.winCounts.p2}`);
console.log(`Ties: ${result.winCounts.ties}`);
console.log(`Win Rate: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
console.log(`Avg P1 Score: ${result.finalStats.avgP1Score.toFixed(0)}`);
console.log(`Avg P2 Score: ${result.finalStats.avgP2Score.toFixed(0)}`);

// Check individual episodes
console.log('\n=== Episode Details ===');
for (let i = 0; i < result.episodes.length; i++) {
  const ep = result.episodes[i]!;
  console.log(`Episode ${i + 1}: Winner=${ep.winner === null ? 'TIE' : `P${ep.winner + 1}`} | P1: ${ep.p1Score} | P2: ${ep.p2Score} | Moves: ${ep.p1Moves}`);
}

if (result.winCounts.ties === result.episodes.length) {
  console.log('\n⚠️  All games ended in ties. Consider increasing maxStepsPerEpisode.');
} else {
  console.log('\n✓ Games are completing successfully!');
}
