/**
 * Constrained Beam Search
 *
 * Efficient move evaluation using beam search with configurable width.
 * Targets <4ms decision latency by limiting search space.
 */

import { TetrisGame } from '../core/game';
import { Piece } from '../core/types';
import { FeatureVector } from './features';

/**
 * Placement candidate with evaluation
 */
export interface BeamCandidate {
  piece: Piece;          // Piece to place
  rotation: number;      // Rotation state (0-3)
  column: number;        // Target column
  useHold: boolean;      // Whether to use hold
  dropDistance: number;  // Drop distance
  evaluation: number;    // Evaluation score
  features?: FeatureVector;  // Extracted features
}

/**
 * Beam search configuration
 */
export interface BeamSearchConfig {
  beamWidth: number;     // Maximum candidates to keep per step
  maxDepth: number;      // Lookahead depth (1 = no lookahead)
  timeLimit: number;     // Maximum time in milliseconds
  pruneThreshold: number;  // Prune candidates below this percentile
}

/**
 * Default beam search configuration
 */
export const DEFAULT_BEAM_CONFIG: BeamSearchConfig = {
  beamWidth: 8,
  maxDepth: 1,
  timeLimit: 4,  // 4ms target
  pruneThreshold: 0.3  // Keep top 70%
};

/**
 * Beam search result
 */
export interface BeamSearchResult {
  bestCandidate: BeamCandidate;
  candidatesEvaluated: number;
  timeElapsed: number;  // milliseconds
  beamWidth: number;
}

/**
 * Evaluate function type
 */
export type EvaluateFunction = (game: TetrisGame, dropDistance: number) => {
  evaluation: number;
  features: FeatureVector;
};

/**
 * Perform constrained beam search to find best move
 */
export function beamSearch(
  game: TetrisGame,
  evaluateFn: EvaluateFunction,
  config: BeamSearchConfig = DEFAULT_BEAM_CONFIG
): BeamSearchResult {
  const startTime = performance.now();
  let candidatesEvaluated = 0;

  // Generate all possible placements
  const allCandidates = enumerateCandidates(game);

  // Evaluate all candidates
  const evaluatedCandidates: BeamCandidate[] = [];

  for (const candidate of allCandidates) {
    // Check time limit
    const elapsed = performance.now() - startTime;
    if (elapsed > config.timeLimit && evaluatedCandidates.length > 0) {
      break;  // Time limit reached
    }

    // Simulate placement
    const simGame = game.clone();

    try {
      // Apply hold if needed
      if (candidate.useHold) {
        simGame.hold();
      }

      // Get active piece after potential hold
      const activePiece = simGame.getActivePiece();
      if (!activePiece) {
        continue;
      }

      // Rotate to target rotation
      const currentRotation = activePiece.rotation;
      const targetRotation = candidate.rotation;
      const rotationDiff = (targetRotation - currentRotation + 4) % 4;

      for (let i = 0; i < rotationDiff; i++) {
        simGame.rotate('cw');
      }

      // Move to target column
      const currentPiece = simGame.getActivePiece();
      if (!currentPiece) {
        continue;
      }
      const currentX = currentPiece.position.x;
      const targetX = candidate.column;
      const moveDiff = targetX - currentX;

      if (moveDiff > 0) {
        for (let i = 0; i < moveDiff; i++) {
          if (!simGame.move(1)) break;
        }
      } else if (moveDiff < 0) {
        for (let i = 0; i < Math.abs(moveDiff); i++) {
          if (!simGame.move(-1)) break;
        }
      }

      // Hard drop and get result
      const dropResult = simGame.hardDrop();

      if (dropResult) {
        // Valid placement
        const result = evaluateFn(simGame, dropResult.linesCleared);
        candidate.evaluation = result.evaluation;
        candidate.features = result.features;
        candidate.dropDistance = dropResult.linesCleared;
        evaluatedCandidates.push(candidate);
        candidatesEvaluated++;
      }
    } catch (e) {
      // Invalid placement, skip
      continue;
    }
  }

  // Sort by evaluation (descending)
  evaluatedCandidates.sort((a, b) => b.evaluation - a.evaluation);

  // Prune to beam width
  const beam = evaluatedCandidates.slice(0, config.beamWidth);

  // Select best candidate
  const bestCandidate = beam[0] ?? evaluatedCandidates[0];

  if (!bestCandidate) {
    throw new Error('No valid candidates found in beam search');
  }

  const timeElapsed = performance.now() - startTime;

  return {
    bestCandidate,
    candidatesEvaluated,
    timeElapsed,
    beamWidth: beam.length
  };
}

/**
 * Enumerate all possible placement candidates
 */
function enumerateCandidates(game: TetrisGame): BeamCandidate[] {
  const candidates: BeamCandidate[] = [];

  const activePiece = game.getActivePiece();
  if (!activePiece) {
    return candidates;
  }

  // Current piece candidates
  addPieceCandidates(candidates, activePiece, false, game);

  // Hold piece candidates (if hold available)
  const status = game.getStatus();
  if (!status.holdLocked) {
    const holdPiece = game.getHoldPiece();
    if (holdPiece) {
      // Use hold piece - create a piece object for it
      const holdPieceObj: Piece = {
        type: holdPiece,
        rotation: 0,
        position: { x: 3, y: 0 }
      };
      addPieceCandidates(candidates, holdPieceObj, true, game);
    } else {
      // First time hold: check next piece
      const nextPieces = game.getNextQueue();
      if (nextPieces[0]) {
        const nextPieceObj: Piece = {
          type: nextPieces[0],
          rotation: 0,
          position: { x: 3, y: 0 }
        };
        addPieceCandidates(candidates, nextPieceObj, true, game);
      }
    }
  }

  return candidates;
}

/**
 * Add candidates for a specific piece
 */
function addPieceCandidates(
  candidates: BeamCandidate[],
  piece: Piece,
  useHold: boolean,
  game: TetrisGame
): void {
  const rotations = piece.type === 'O' ? 1 : 4;  // O piece has only 1 unique rotation
  const board = game.getBoard();

  for (let rotation = 0; rotation < rotations; rotation++) {
    // Try all columns
    for (let column = 0; column < board.width; column++) {
      const testPiece: Piece = {
        type: piece.type,
        rotation: rotation as 0 | 1 | 2 | 3,
        position: { x: column, y: 0 }
      };

      // Check if placement is valid
      if (isValidPlacement(testPiece, game)) {
        candidates.push({
          piece: piece,
          rotation,
          column,
          useHold,
          dropDistance: 0,
          evaluation: 0
        });
      }
    }
  }
}

/**
 * Check if placement is valid (piece can spawn and drop)
 */
function isValidPlacement(piece: Piece, game: TetrisGame): boolean {
  const board = game.getBoard();
  // Check if piece can be placed at any valid Y position
  for (let y = 0; y < board.height; y++) {
    const testPiece: Piece = {
      type: piece.type,
      rotation: piece.rotation,
      position: { x: piece.position.x, y: y }
    };
    if (game.canPlace(testPiece)) {
      return true;
    }
  }
  return false;
}

/**
 * Optimized beam search with early pruning
 */
export function optimizedBeamSearch(
  game: TetrisGame,
  evaluateFn: EvaluateFunction,
  config: BeamSearchConfig = DEFAULT_BEAM_CONFIG
): BeamSearchResult {
  const startTime = performance.now();
  let candidatesEvaluated = 0;

  // Generate candidates in batches
  const allCandidates = enumerateCandidates(game);

  // Quick pre-filter: remove obviously bad candidates
  const filteredCandidates = quickFilter(allCandidates, game);

  // Evaluate filtered candidates
  const evaluatedCandidates: BeamCandidate[] = [];

  for (const candidate of filteredCandidates) {
    // Check time limit
    const elapsed = performance.now() - startTime;
    if (elapsed > config.timeLimit && evaluatedCandidates.length >= config.beamWidth) {
      break;
    }

    // Simulate and evaluate
    const simGame = game.clone();

    try {
      if (candidate.useHold) {
        simGame.hold();
      }

      // Get active piece after potential hold
      const activePiece = simGame.getActivePiece();
      if (!activePiece) {
        continue;
      }

      // Rotate to target rotation
      const currentRotation = activePiece.rotation;
      const targetRotation = candidate.rotation;
      const rotationDiff = (targetRotation - currentRotation + 4) % 4;

      for (let i = 0; i < rotationDiff; i++) {
        simGame.rotate('cw');
      }

      // Move to target column
      const currentPiece = simGame.getActivePiece();
      if (!currentPiece) {
        continue;
      }
      const currentX = currentPiece.position.x;
      const targetX = candidate.column;
      const moveDiff = targetX - currentX;

      if (moveDiff > 0) {
        for (let i = 0; i < moveDiff; i++) {
          if (!simGame.move(1)) break;
        }
      } else if (moveDiff < 0) {
        for (let i = 0; i < Math.abs(moveDiff); i++) {
          if (!simGame.move(-1)) break;
        }
      }

      // Hard drop and get result
      const dropResult = simGame.hardDrop();

      if (dropResult) {
        const result = evaluateFn(simGame, dropResult.linesCleared);
        candidate.evaluation = result.evaluation;
        candidate.features = result.features;
        candidate.dropDistance = dropResult.linesCleared;
        evaluatedCandidates.push(candidate);
        candidatesEvaluated++;

        // Early termination if we have enough good candidates
        if (evaluatedCandidates.length >= config.beamWidth * 2) {
          evaluatedCandidates.sort((a, b) => b.evaluation - a.evaluation);
          if (evaluatedCandidates.length > config.beamWidth) {
            const threshold = evaluatedCandidates[config.beamWidth - 1]!.evaluation;
            // If we have a clear winner, stop early
            if (evaluatedCandidates[0]!.evaluation > threshold * 1.5) {
              break;
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  // Sort and select best
  evaluatedCandidates.sort((a, b) => b.evaluation - a.evaluation);
  const beam = evaluatedCandidates.slice(0, config.beamWidth);
  const bestCandidate = beam[0];

  if (!bestCandidate) {
    throw new Error('No valid candidates found in optimized beam search');
  }

  const timeElapsed = performance.now() - startTime;

  return {
    bestCandidate,
    candidatesEvaluated,
    timeElapsed,
    beamWidth: beam.length
  };
}

/**
 * Quick filter to remove obviously bad candidates
 */
function quickFilter(candidates: BeamCandidate[], game: TetrisGame): BeamCandidate[] {
  // For now, return all candidates
  // Could add heuristics here to filter out unlikely good moves
  return candidates;
}

/**
 * Adaptive beam search that adjusts width based on time budget
 */
export function adaptiveBeamSearch(
  game: TetrisGame,
  evaluateFn: EvaluateFunction,
  targetTime: number = 4
): BeamSearchResult {
  // Start with small beam, increase if time allows
  const startWidth = 6;
  const maxWidth = 12;

  let config: BeamSearchConfig = {
    ...DEFAULT_BEAM_CONFIG,
    beamWidth: startWidth,
    timeLimit: targetTime
  };

  let result = optimizedBeamSearch(game, evaluateFn, config);

  // If we finished quickly, try with larger beam
  if (result.timeElapsed < targetTime * 0.5 && config.beamWidth < maxWidth) {
    config.beamWidth = Math.min(config.beamWidth * 2, maxWidth);
    result = optimizedBeamSearch(game, evaluateFn, config);
  }

  return result;
}
