import { PatternInferenceAgent, SimulationOutcome } from '../ai/agent';
import { TetrisGame } from '../core/game';
import { GameStats } from '../core/types';

interface VersusPlayerInternal {
  readonly game: TetrisGame;
  incomingGarbage: number;
  totalGarbageSent: number;
  totalGarbageReceived: number;
  moves: number;
  eliminated: boolean;
}

export interface VersusPlayerSnapshot {
  stats: GameStats;
  incomingGarbage: number;
  totalGarbageSent: number;
  totalGarbageReceived: number;
  moves: number;
  eliminated: boolean;
}

export interface VersusStepResult {
  playerIndex: 0 | 1;
  outcome: SimulationOutcome | null;
  statsBefore: GameStats;
  statsAfter: GameStats;
  rawAttack: number;
  garbageCancelled: number;
  garbageSent: number;
  garbageApplied: number;
  eliminated: boolean;
}

export interface VersusEnvironmentOptions {
  seedP1?: number;
  seedP2?: number;
  garbageSeed?: number;
  random?: () => number;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function createGameWithSeed(seed?: number): TetrisGame {
  return seed === undefined ? new TetrisGame() : new TetrisGame({ seed });
}

export class VersusEnvironment {
  private readonly players: [VersusPlayerInternal, VersusPlayerInternal];
  private readonly random: () => number;

  constructor(options: VersusEnvironmentOptions = {}) {
    this.random =
      options.random ??
      (typeof options.garbageSeed === 'number'
        ? createSeededRandom(options.garbageSeed)
        : Math.random);
    this.players = [
      {
        game: createGameWithSeed(options.seedP1),
        incomingGarbage: 0,
        totalGarbageSent: 0,
        totalGarbageReceived: 0,
        moves: 0,
        eliminated: false,
      },
      {
        game: createGameWithSeed(options.seedP2),
        incomingGarbage: 0,
        totalGarbageSent: 0,
        totalGarbageReceived: 0,
        moves: 0,
        eliminated: false,
      },
    ];
  }

  getGame(index: 0 | 1): TetrisGame {
    return this.players[index].game;
  }

  getPlayerSnapshot(index: 0 | 1): VersusPlayerSnapshot {
    const player = this.players[index];
    return {
      stats: player.game.getStats(),
      incomingGarbage: player.incomingGarbage,
      totalGarbageSent: player.totalGarbageSent,
      totalGarbageReceived: player.totalGarbageReceived,
      moves: player.moves,
      eliminated: player.eliminated || player.game.isGameOver(),
    };
  }

  actWithAgent(
    playerIndex: 0 | 1,
    agent: PatternInferenceAgent,
  ): VersusStepResult {
    return this.step(playerIndex, (game) => agent.act(game));
  }

  step(
    playerIndex: 0 | 1,
    actor: (game: TetrisGame) => SimulationOutcome | null,
  ): VersusStepResult {
    const player = this.players[playerIndex];
    const opponent = this.players[this.other(playerIndex)];
    const statsBefore = player.game.getStats();

    let outcome: SimulationOutcome | null = null;
    let rawAttack = 0;
    let garbageCancelled = 0;
    let garbageSent = 0;
    let garbageApplied = 0;

    const canAct = !player.eliminated && !player.game.isGameOver();
    if (canAct) {
      outcome = actor(player.game);
      player.moves += 1;
      if (outcome?.clear) {
        rawAttack = outcome.clear.garbageSent;
        if (rawAttack > 0) {
          const cancelled = Math.min(rawAttack, player.incomingGarbage);
          garbageCancelled = cancelled;
          player.incomingGarbage -= cancelled;
          const toSend = rawAttack - cancelled;
          if (toSend > 0) {
            opponent.incomingGarbage += toSend;
            garbageSent = toSend;
            player.totalGarbageSent += toSend;
          }
        }
      }
    }

    garbageApplied = this.applyPendingGarbage(player);

    const statsAfter = player.game.getStats();

    if (player.game.isGameOver()) {
      player.eliminated = true;
    }

    return {
      playerIndex,
      outcome,
      statsBefore,
      statsAfter,
      rawAttack,
      garbageCancelled,
      garbageSent,
      garbageApplied,
      eliminated: player.eliminated,
    };
  }

  hasEnded(): boolean {
    return (
      this.players[0].eliminated ||
      this.players[1].eliminated ||
      this.players[0].game.isGameOver() ||
      this.players[1].game.isGameOver()
    );
  }

  winner(): 0 | 1 | null {
    const p1Out = this.players[0].eliminated || this.players[0].game.isGameOver();
    const p2Out = this.players[1].eliminated || this.players[1].game.isGameOver();
    if (p1Out && p2Out) {
      return null;
    }
    if (p1Out) {
      return 1;
    }
    if (p2Out) {
      return 0;
    }
    return null;
  }

  private applyPendingGarbage(player: VersusPlayerInternal): number {
    const amount = player.incomingGarbage;
    if (amount <= 0) {
      return 0;
    }
    player.incomingGarbage = 0;
    player.game.injectGarbage(amount, this.random);
    player.totalGarbageReceived += amount;
    if (player.game.isGameOver()) {
      player.eliminated = true;
    }
    return amount;
  }

  private other(index: 0 | 1): 0 | 1 {
    return (index === 0 ? 1 : 0) as 0 | 1;
  }
}
