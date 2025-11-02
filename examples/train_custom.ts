/**
 * Custom configuration training example
 */

import { runStrategicVersusTraining } from '../src/training/strategic_versus_engine.js';
import fs from 'fs';

console.log('🎮 Strategic Training with Custom Configuration\n');

const result = runStrategicVersusTraining({
  // Training duration
  totalEpisodes: 50,
  maxStepsPerEpisode: 500,

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

console.log('\n=== Training Results ===');
console.log(`Episodes: ${result.episodes.length}`);
console.log(`Win Rate: ${(result.finalStats.p1WinRate * 100).toFixed(1)}%`);
console.log(`Avg P1 Score: ${result.finalStats.avgP1Score.toFixed(0)}`);
console.log(`Avg P2 Score: ${result.finalStats.avgP2Score.toFixed(0)}`);
console.log(`Avg Episode Length: ${result.finalStats.avgEpisodeLength.toFixed(0)} moves`);

if (result.curriculumProgress) {
  const stats = result.curriculumProgress.getStats();
  console.log(`\nCurriculum Progress:`);
  console.log(`  Current Stage: ${stats.currentStage}`);
  console.log(`  Stage Episodes: ${stats.stageEpisodes}`);
  console.log(`  Stage Win Rate: ${(stats.stageWinRate * 100).toFixed(1)}%`);
  console.log(`  Overall Progress: ${(stats.overallProgress * 100).toFixed(1)}%`);
}

// Save agent
fs.writeFileSync('custom_agent.json', JSON.stringify(result.learningAgent.toJSON(), null, 2));
console.log('\n✓ Agent saved to custom_agent.json');
