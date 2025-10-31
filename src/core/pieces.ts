import { PieceType, Rotation } from './types';

type ShapeMatrix = readonly (readonly [number, number])[];

type RotationMap = Record<Rotation, ShapeMatrix>;

type PieceShapeMap = Record<PieceType, RotationMap>;

type KickList = readonly [number, number][];
type KickRotationMap = Partial<Record<Rotation, KickList>>;
type PieceKickMap = Partial<Record<Rotation, KickRotationMap>>;

export const PIECE_SHAPES: PieceShapeMap = {
  I: {
    0: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    1: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    2: [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    3: [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  },
  O: {
    0: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    1: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    2: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    3: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
  },
  T: {
    0: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    1: [
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    2: [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    3: [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  S: {
    0: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    1: [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    2: [
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
    3: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  Z: {
    0: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    1: [
      [2, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
    2: [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    3: [
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  },
  J: {
    0: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    1: [
      [1, 0],
      [2, 0],
      [1, 1],
      [1, 2],
    ],
    2: [
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
    3: [
      [1, 0],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  },
  L: {
    0: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    1: [
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
    2: [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
    ],
    3: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
};

export const SRS_KICKS: Record<PieceType, PieceKickMap> = {
  I: {
    0: {
      1: [
        [0, 0],
        [-2, 0],
        [1, 0],
        [-2, -1],
        [1, 2],
      ],
      3: [
        [0, 0],
        [-1, 0],
        [2, 0],
        [-1, 2],
        [2, -1],
      ],
    },
    1: {
      0: [
        [0, 0],
        [2, 0],
        [-1, 0],
        [2, 1],
        [-1, -2],
      ],
      2: [
        [0, 0],
        [-1, 0],
        [2, 0],
        [-1, 2],
        [2, -1],
      ],
    },
    2: {
      1: [
        [0, 0],
        [1, 0],
        [-2, 0],
        [1, -2],
        [-2, 1],
      ],
      3: [
        [0, 0],
        [2, 0],
        [-1, 0],
        [2, 1],
        [-1, -2],
      ],
    },
    3: {
      0: [
        [0, 0],
        [1, 0],
        [-2, 0],
        [1, -2],
        [-2, 1],
      ],
      2: [
        [0, 0],
        [-2, 0],
        [1, 0],
        [-2, -1],
        [1, 2],
      ],
    },
  },
  O: {
    0: {
      1: [[0, 0]],
      3: [[0, 0]],
    },
    1: {
      0: [[0, 0]],
      2: [[0, 0]],
    },
    2: {
      1: [[0, 0]],
      3: [[0, 0]],
    },
    3: {
      0: [[0, 0]],
      2: [[0, 0]],
    },
  },
  J: standardKickTable(),
  L: standardKickTable(),
  S: standardKickTable(),
  Z: standardKickTable(),
  T: standardKickTable(),
};

function standardKickTable(): PieceKickMap {
  return {
    0: {
      1: [
        [0, 0],
        [-1, 0],
        [-1, 1],
        [0, -2],
        [-1, -2],
      ],
      3: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, -2],
        [1, -2],
      ],
    },
    1: {
      0: [
        [0, 0],
        [1, 0],
        [1, -1],
        [0, 2],
        [1, 2],
      ],
      2: [
        [0, 0],
        [1, 0],
        [1, -1],
        [0, 2],
        [1, 2],
      ],
    },
    2: {
      1: [
        [0, 0],
        [-1, 0],
        [-1, 1],
        [0, -2],
        [-1, -2],
      ],
      3: [
        [0, 0],
        [-1, 0],
        [-1, 1],
        [0, -2],
        [-1, -2],
      ],
    },
    3: {
      0: [
        [0, 0],
        [-1, 0],
        [-1, -1],
        [0, 2],
        [-1, 2],
      ],
      2: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, -2],
        [1, -2],
      ],
    },
  };
}

export function getAbsoluteCells(
  type: PieceType,
  rotation: Rotation,
  position: { x: number; y: number },
): { x: number; y: number }[] {
  const shape = PIECE_SHAPES[type][rotation];
  return shape.map(([dx, dy]) => ({
    x: position.x + dx,
    y: position.y + dy,
  }));
}

export function rotate(rotation: Rotation, delta: number): Rotation {
  const next = ((rotation + delta) % 4 + 4) % 4;
  return next as Rotation;
}
