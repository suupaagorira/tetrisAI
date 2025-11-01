import { Board, BoardDimensions, Cell } from './types';

export class MatrixBoard implements Board {
  public readonly width: number;
  public readonly height: number;
  public readonly hiddenRows: number;
  public readonly cells: Cell[][];

  constructor(dimensions: BoardDimensions, fill: Cell = 0) {
    this.width = dimensions.width;
    this.height = dimensions.height;
    this.hiddenRows = dimensions.hiddenRows;
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => fill),
    );
  }

  clone(): MatrixBoard {
    const copy = new MatrixBoard(
      {
        width: this.width,
        height: this.height,
        hiddenRows: this.hiddenRows,
      },
      0,
    );
    for (let y = 0; y < this.height; y += 1) {
      const sourceRow = this.cells[y]!;
      const targetRow = copy.cells[y]!;
      for (let x = 0; x < this.width; x += 1) {
        targetRow[x] = sourceRow[x]!;
      }
    }
    return copy;
  }

  get(x: number, y: number): Cell | undefined {
    if (!this.isInside(x, y)) {
      return undefined;
    }
    const row = this.cells[y];
    return row?.[x];
  }

  set(x: number, y: number, value: Cell): void {
    if (!this.isInside(x, y)) {
      throw new Error(`Coordinates (${x}, ${y}) are outside of the board`);
    }
    const row = this.cells[y];
    if (!row) {
      throw new Error(`Row ${y} missing in board data`);
    }
    row[x] = value;
  }

  isInside(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isOccupied(x: number, y: number): boolean {
    if (!this.isInside(x, y)) {
      return true;
    }
    const row = this.cells[y];
    return (row?.[x] ?? 0) !== 0;
  }

  lockPiece(
    coordinates: readonly { x: number; y: number }[],
    cellValue: Cell,
  ): void {
    for (const { x, y } of coordinates) {
      if (!this.isInside(x, y)) {
        throw new Error(`Lock outside board: (${x}, ${y})`);
      }
      const row = this.cells[y];
      if (!row) {
        throw new Error(`Row ${y} missing when locking piece`);
      }
      row[x] = cellValue;
    }
  }

  clearLines(): { clearedRows: number[] } {
    const clearedRows: number[] = [];
    for (let y = 0; y < this.height; y += 1) {
      const row = this.cells[y];
      if (row && row.every((cell) => cell !== 0)) {
        clearedRows.push(y);
      }
    }

    // Remove cleared rows from bottom to top to avoid index shift issues
    // Sort in descending order for deletion
    const sortedForDeletion = [...clearedRows].sort((a, b) => b - a);
    for (const row of sortedForDeletion) {
      this.cells.splice(row, 1);
    }

    // Add new empty rows at the top
    for (let i = 0; i < clearedRows.length; i++) {
      this.cells.unshift(
        Array.from({ length: this.width }, () => 0 as Cell),
      );
    }

    return { clearedRows };
  }
}

export const STANDARD_BOARD: BoardDimensions = {
  width: 10,
  height: 22, // includes hidden rows
  hiddenRows: 2,
};
