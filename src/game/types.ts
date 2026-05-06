export type Point = { x: number; y: number };

export interface Tile {
  id: string;
  value: number;
  x: number;
  y: number;
  previousX?: number;
  previousY?: number;
  mergedFrom?: Tile[];
  isNew?: boolean;
}

export interface GameState {
  grid: (Tile | null)[][];
  score: number;
  bestScore: number;
  gameOver: boolean;
  won: boolean;
  combo: number;
  lastMergeTime: number;
}

export const GRID_SIZE = 4;
export const WINNING_VALUE = 2048;

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'pro' | 'elite';

export const DIFFICULTIES: Record<Difficulty, {
  name: string;
  gridSize: number;
  target: number;
  multiplier: number;
  color: string;
}> = {
  easy: { name: 'EASY', gridSize: 5, target: 2048, multiplier: 0.5, color: '#a3e635' },
  medium: { name: 'MEDIUM', gridSize: 4, target: 2048, multiplier: 1.0, color: '#3b82f6' },
  hard: { name: 'HARD', gridSize: 3, target: 1024, multiplier: 2.0, color: '#f43f5e' },
  extreme: { name: 'EXTREME', gridSize: 3, target: 2048, multiplier: 4.0, color: '#8b5cf6' },
  pro: { name: 'PRO', gridSize: 4, target: 4096, multiplier: 8.0, color: '#d946ef' },
  elite: { name: 'ELITE', gridSize: 3, target: 4096, multiplier: 15.0, color: '#ffffff' }
};

export const RANKS = [
  { name: 'NEOPHYTE', minLevel: 1, color: '#737373' },
  { name: 'RUNNER', minLevel: 5, color: '#a3e635' },
  { name: 'SYNCHRONIZER', minLevel: 15, color: '#3b82f6' },
  { name: 'CIRCUIT BREAKER', minLevel: 30, color: '#f43f5e' },
  { name: 'PULSE MASTER', minLevel: 50, color: '#8b5cf6' },
  { name: 'TRANSCENDENT', minLevel: 80, color: '#fbbf24' },
  { name: 'NEON GOD', minLevel: 120, color: '#ffffff' }
];

export const THEME = {
  background: '#0a0a0a',
  gridBackground: '#171717',
  emptyTile: '#262626',
  neon: {
    2: '#a3e635',    // lime-400
    4: '#a3e635',    // lime-400
    8: '#3b82f6',    // blue-500
    16: '#3b82f6',   // blue-500
    32: '#f43f5e',   // rose-500
    64: '#f43f5e',   // rose-500
    128: '#f43f5e',  // rose-500
    256: '#8b5cf6',  // violet-600
    512: '#8b5cf6',  // violet-600
    1024: '#8b5cf6', // violet-600
    2048: '#ffffff'
  }
};
