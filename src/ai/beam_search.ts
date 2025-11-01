/**
 * Constrained Beam Search
 *
 * Efficient move evaluation using beam search with configurable width.
 * Targets <4ms decision latency by limiting search space.
 */

import { TetrisGame } from '../core/game';
import { Piece } from '../core/pieces';
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

      // Create piece at target position
      const targetPiece = new Piece(candidate.piece.type, candidate.rotation);
      targetPiece.x = candidate.column;

      // Find drop position
      let dropY = 0;
      while (simGame.canPlace(new Piece(targetPiece.type, targetPiece.rotation, targetPiece.x, dropY + 1))) {
        dropY++;
      }
      targetPiece.y = dropY;

      // Set as active piece and hard drop
      simGame.activePiece = targetPiece;
      const dropDist = simGame.hardDrop();

      if (dropDist >= 0) {
        // Valid placement
        const result = evaluateFn(simGame, dropDist);
        candidate.evaluation = result.evaluation;
        candidate.features = result.features;
        candidate.dropDistance = dropDist;
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

  if (!game.activePiece) {
    return candidates;
  }

  // Current piece candidates
  addPieceCandidates(candidates, game.activePiece, false, game);

  // Hold piece candidates (if hold available)
  if (!game.holdLocked) {
    if (game.holdPiece) {
      // Use hold piece
      addPieceCandidates(candidates, game.holdPiece, true, game);
    } else {
      // First time hold: check next piece
      const nextPieces = game.getNextPieces(1);
      if (nextPieces[0]) {
        addPieceCandidates(candidates, nextPieces[0], true, game);
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

  for (let rotation = 0; rotation < rotations; rotation++) {
    const rotatedPiece = new Piece(piece.type, rotation);

    // Try all columns
    for (let column = 0; column < game.board.width; column++) {
      const testPiece = new Piece(rotatedPiece.type, rotation, column, 0);

      // Check if placement is valid
      if (isValidPlacement(testPiece, game)) {
        candidates.push({
          piece: new Piece(piece.type),
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
  // Check if piece can be placed at any valid Y position
  for (let y = 0; y < game.board.height; y++) {
    const testPiece = new Piece(piece.type, piece.rotation, piece.x, y);
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

      const targetPiece = new Piece(candidate.piece.type, candidate.rotation, candidate.column);

      // Fast drop
      let dropY = 0;
      while (simGame.canPlace(new Piece(targetPiece.type, targetPiece.rotation, targetPiece.x, dropY + 1))) {
        dropY++;
      }
      targetPiece.y = dropY;

      simGame.activePiece = targetPiece;
      const dropDist = simGame.hardDrop();

      if (dropDist >= 0) {
        const result = evaluateFn(simGame, dropDist);
        candidate.evaluation = result.evaluation;
        candidate.features = result.features;
        candidate.dropDistance = dropDist;
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
