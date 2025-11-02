/**
 * Strategic training example (from documentation)
 */

import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine.js';
import fs from 'fs';

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
const agentData = result.learningAgent.toJSON();
fs.writeFileSync('trained_agent.json', JSON.stringify(agentData, null, 2));
console.log('\n✓ Agent saved to trained_agent.json');
