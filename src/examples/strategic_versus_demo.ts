/**
 * Strategic Versus Mode Demo
 *
 * Demonstrates the strategic AI system in competitive versus mode.
 */

import { Bag } from '../core/bag';
import { TetrisGame } from '../core/game';
import { createVersusAgent, StrategicAgent } from '../ai/strategic_agent';
import { VersusContext } from '../ai/features_extended';

/**
 * Simple versus match between two strategic agents
 */
export function runStrategicVersusDemo(): void {
  console.log('=== Strategic Versus Demo ===\n');

  // Create two agents with different initial strategies
  const agent1 = createVersusAgent();
  const agent2 = createVersusAgent();

  // Create games for both players
  const bag1 = new Bag(12345);
  const bag2 = new Bag(54321);
  const game1 = new TetrisGame(bag1);
  const game2 = new TetrisGame(bag2);

  let moveCount = 0;
  const maxMoves = 100;

  // Simple garbage queues
  let garbageQueue1 = 0;
  let garbageQueue2 = 0;

  console.log('Starting match...\n');

  while (!game1.isGameOver() && !game2.isGameOver() && moveCount < maxMoves) {
    // Player 1 move
    if (!game1.isGameOver()) {
      // Calculate board metrics for P1
      const p1Height = calculateMaxHeight(game1);
      const p1Holes = calculateHoles(game1);

      // Set versus context for P1
      const p2Height = calculateMaxHeight(game2);
      const p2Holes = calculateHoles(game2);
      const versusContext1: VersusContext = {
        opponentHeight: p2Height / 20,
        opponentHoles: p2Holes / 200,
        incomingGarbage: garbageQueue1,
        outgoingGarbage: 0,
        canCancel: garbageQueue1 > 0
      };

      agent1.setVersusContext(versusContext1);

      // Make decision and act
      const initialLines1 = game1.lines;
      agent1.act(game1);
      const linesCleared1 = game1.lines - initialLines1;

      // Calculate garbage sent
      if (linesCleared1 > 0) {
        const garbageSent = calculateGarbage(linesCleared1, game1.backToBack, game1.combo);
        garbageQueue2 += garbageSent;

        if (garbageSent > 0) {
          console.log(`P1: Cleared ${linesCleared1} lines, sending ${garbageSent} garbage to P2`);
        }
      }
    }

    // Player 2 move
    if (!game2.isGameOver()) {
      // Calculate board metrics for P2
      const p2Height = calculateMaxHeight(game2);
      const p2Holes = calculateHoles(game2);

      // Set versus context for P2
      const p1Height = calculateMaxHeight(game1);
      const p1Holes = calculateHoles(game1);
      const versusContext2: VersusContext = {
        opponentHeight: p1Height / 20,
        opponentHoles: p1Holes / 200,
        incomingGarbage: garbageQueue2,
        outgoingGarbage: 0,
        canCancel: garbageQueue2 > 0
      };

      agent2.setVersusContext(versusContext2);

      // Make decision and act
      const initialLines2 = game2.lines;
      agent2.act(game2);
      const linesCleared2 = game2.lines - initialLines2;

      // Calculate garbage sent
      if (linesCleared2 > 0) {
        const garbageSent = calculateGarbage(linesCleared2, game2.backToBack, game2.combo);
        garbageQueue1 += garbageSent;

        if (garbageSent > 0) {
          console.log(`P2: Cleared ${linesCleared2} lines, sending ${garbageSent} garbage to P1`);
        }
      }
    }

    moveCount++;

    // Periodic status update
    if (moveCount % 20 === 0) {
      console.log(`\n--- Move ${moveCount} ---`);
      console.log(`P1: Score=${game1.score}, Lines=${game1.lines}, Height=${p1Height}, Strategy=${agent1.getCurrentStrategy()}`);
      console.log(`P2: Score=${game2.score}, Lines=${game2.lines}, Height=${p2Height}, Strategy=${agent2.getCurrentStrategy()}`);
      console.log(`Garbage queues: P1=${garbageQueue1}, P2=${garbageQueue2}\n`);
    }
  }

  // Determine winner
  let winner = 'Tie';
  if (game1.isGameOver() && !game2.isGameOver()) {
    winner = 'Player 2';
  } else if (game2.isGameOver() && !game1.isGameOver()) {
    winner = 'Player 1';
  } else if (game1.score > game2.score) {
    winner = 'Player 1 (by score)';
  } else if (game2.score > game1.score) {
    winner = 'Player 2 (by score)';
  }

  console.log('\n=== Match Complete ===');
  console.log(`Winner: ${winner}`);
  console.log(`\nPlayer 1 Final Stats:`);
  console.log(`  Score: ${game1.score}`);
  console.log(`  Lines: ${game1.lines}`);
  console.log(`  Final Strategy: ${agent1.getCurrentStrategy()}`);
  console.log(`\nPlayer 2 Final Stats:`);
  console.log(`  Score: ${game2.score}`);
  console.log(`  Lines: ${game2.lines}`);
  console.log(`  Final Strategy: ${agent2.getCurrentStrategy()}`);

  // Export telemetry
  console.log('\n=== Performance Summary ===');
  const summary1 = JSON.parse(agent1.exportSummaryJSON(game1.score, game1.lines, winner === 'Player 1'));
  const summary2 = JSON.parse(agent2.exportSummaryJSON(game2.score, game2.lines, winner === 'Player 2'));

  console.log(`\nPlayer 1 Performance:`);
  console.log(`  Average Latency: ${summary1.averageLatency.toFixed(2)}ms`);
  console.log(`  P99 Latency: ${summary1.p99Latency.toFixed(2)}ms`);
  console.log(`  Violations (>8ms): ${summary1.violationsAbove8ms}`);

  console.log(`\nPlayer 2 Performance:`);
  console.log(`  Average Latency: ${summary2.averageLatency.toFixed(2)}ms`);
  console.log(`  P99 Latency: ${summary2.p99Latency.toFixed(2)}ms`);
  console.log(`  Violations (>8ms): ${summary2.violationsAbove8ms}`);
}

/**
 * Calculate maximum height of board
 */
function calculateMaxHeight(game: TetrisGame): number {
  let maxHeight = 0;
  for (let x = 0; x < game.board.width; x++) {
    for (let y = 2; y < game.board.height; y++) {
      if (game.board.cells[y]![x] !== 0) {
        const height = game.board.height - y - 2;
        maxHeight = Math.max(maxHeight, height);
        break;
      }
    }
  }
  return maxHeight;
}

/**
 * Calculate holes in board
 */
function calculateHoles(game: TetrisGame): number {
  let holes = 0;
  for (let x = 0; x < game.board.width; x++) {
    let foundBlock = false;
    for (let y = 2; y < game.board.height; y++) {
      if (game.board.cells[y]![x] !== 0) {
        foundBlock = true;
      } else if (foundBlock) {
        holes++;
      }
    }
  }
  return holes;
}

/**
 * Calculate garbage sent based on lines cleared
 */
function calculateGarbage(linesCleared: number, backToBack: boolean, combo: number): number {
  let garbage = 0;

  // Base garbage
  if (linesCleared === 1) garbage = 0;
  else if (linesCleared === 2) garbage = 1;
  else if (linesCleared === 3) garbage = 2;
  else if (linesCleared >= 4) garbage = 4;

  // B2B bonus
  if (backToBack && linesCleared >= 4) {
    garbage += 1;
  }

  // Combo bonus
  if (combo > 1) {
    garbage += Math.floor(combo / 2);
  }

  return garbage;
}

// Run demo if executed directly
if (require.main === module) {
  runStrategicVersusDemo();
}
