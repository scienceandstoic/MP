import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Tile, Point, THEME, DIFFICULTIES, Difficulty, RANKS } from './types';
import { useAuth } from '../hooks/useAuth';
import { saveScore, updateUserXP, addGold, updateGameStats } from '../lib/db';

export interface GameEngineHandle {
  useZap: () => void;
  useBomb: () => void;
  useUndo: () => void;
  useSwap: () => void;
  useHammer: () => void;
  reset: () => void;
  isRestricted: () => boolean;
}

export const GameEngine: React.FC<{ 
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  onMove?: (score: number) => void;
  difficulty?: Difficulty;
  engineRef?: React.RefObject<GameEngineHandle | null>;
  seed?: number;
  multiplayerMode?: boolean;
  isDisabled?: boolean;
}> = ({ onGameOver, onScoreChange, onMove, difficulty = 'medium', engineRef, seed, multiplayerMode, isDisabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const config = DIFFICULTIES[difficulty];
  const GRID_SIZE = config.gridSize;

  const [grid, setGrid] = useState<(Tile | null)[][]>(() => 
    Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null))
  );
  const [score, setScore] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [sessionMaxCombo, setSessionMaxCombo] = useState(0);
  const [history, setHistory] = useState<{grid: (Tile | null)[][], score: number}[]>([]);
  const [bombMode, setBombMode] = useState(false);
  const [swapMode, setSwapMode] = useState<{ active: boolean; firstSelection: Point | null }>({ active: false, firstSelection: null });
  const [hammerMode, setHammerMode] = useState(false);

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const [gameOver, setGameOver] = useState(false);
  const { user } = useAuth();

  const checkRevive = useCallback((newGrid: (Tile | null)[][]) => {
    if (gameOver && canMove(newGrid)) {
      setGameOver(false);
      confetti({ particleCount: 100, spread: 100, colors: ['#a3e635'], origin: { y: 0.5 } });
    }
  }, [gameOver]);

  const saveHistory = useCallback((currentGrid: (Tile | null)[][], currentScore: number) => {
    setHistory(prev => [...prev.slice(-9), { grid: JSON.parse(JSON.stringify(currentGrid)), score: currentScore }]);
  }, []);

  const isRestrictedState = useCallback(() => {
    let onlyTwos = true;
    let hasTiles = false;
    grid.forEach(row => {
      row.forEach(tile => {
        if (tile) {
          hasTiles = true;
          if (tile.value !== 2) onlyTwos = false;
        }
      });
    });
    return hasTiles && onlyTwos;
  }, [grid]);

  const useUndo = useCallback(() => {
    if (history.length === 0 || isRestrictedState()) return;
    const lastState = history[history.length - 1];
    setGrid(lastState.grid);
    setScore(lastState.score);
    setHistory(prev => prev.slice(0, -1));
    checkRevive(lastState.grid);
    confetti({ particleCount: 30, colors: ['#3b82f6'], origin: { y: 0.8 } });
  }, [history, isRestrictedState, checkRevive]);

  const useZap = useCallback(() => {
    if (isRestrictedState() || multiplayerMode) return;
    
    let hasTwos = false;
    grid.forEach(row => row.forEach(tile => { if (tile?.value === 2) hasTwos = true; }));
    if (!hasTwos) return;

    saveHistory(grid, score);
    const newGrid = grid.map(row => row.map(tile => {
      if (tile && tile.value === 2) return null;
      return tile;
    }));
    setGrid(newGrid);
    checkRevive(newGrid);
    confetti({ 
      particleCount: 50, 
      colors: ['#a3e635', '#f43f5e'],
      origin: { y: 0.8 } 
    });
  }, [grid, score, saveHistory, isRestrictedState, checkRevive]);

  const useBomb = useCallback(() => {
    if (isRestrictedState() || multiplayerMode) return;
    setBombMode(true);
    setSwapMode({ active: false, firstSelection: null });
    setHammerMode(false);
  }, [isRestrictedState]);

  const useSwap = useCallback(() => {
    if (isRestrictedState() || multiplayerMode) return;
    setSwapMode({ active: true, firstSelection: null });
    setBombMode(false);
    setHammerMode(false);
  }, [isRestrictedState]);

  const useHammer = useCallback(() => {
    if (isRestrictedState() || multiplayerMode) return;
    setHammerMode(true);
    setBombMode(false);
    setSwapMode({ active: false, firstSelection: null });
  }, [isRestrictedState]);

  const handleHammerClick = useCallback((x: number, y: number) => {
    if (!grid[y][x]) return;
    saveHistory(grid, score);
    const newGrid = grid.map(row => [...row]);
    newGrid[y][x] = null;
    setGrid(newGrid);
    setHammerMode(false);
    checkRevive(newGrid);
    confetti({ particleCount: 40, colors: ['#9ca3af'], origin: { y: 0.7 } });
  }, [grid, score, saveHistory, checkRevive]);

  const handleSwapClick = useCallback((x: number, y: number) => {
    if (!grid[y][x]) return;
    
    if (!swapMode.firstSelection) {
      setSwapMode({ active: true, firstSelection: { x, y } });
      return;
    }

    const first = swapMode.firstSelection;
    if (first.x === x && first.y === y) {
      setSwapMode({ active: true, firstSelection: null });
      return;
    }

    saveHistory(grid, score);
    const newGrid = grid.map(row => [...row]);
    const temp = newGrid[first.y][first.x];
    newGrid[first.y][first.x] = newGrid[y][x] ? { ...newGrid[y][x]!, x: first.x, y: first.y } : null;
    newGrid[y][x] = temp ? { ...temp, x, y } : null;

    setGrid(newGrid);
    setSwapMode({ active: false, firstSelection: null });
    checkRevive(newGrid);
    confetti({ particleCount: 60, colors: ['#f472b6'], origin: { y: 0.7 } });
  }, [grid, score, swapMode, saveHistory, checkRevive]);

  const handleBombClick = useCallback((x: number, y: number) => {
    saveHistory(grid, score);
    const newGrid = grid.map(row => [...row]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const targetY = y + dy;
        const targetX = x + dx;
        if (targetY >= 0 && targetY < GRID_SIZE && targetX >= 0 && targetX < GRID_SIZE) {
          newGrid[targetY][targetX] = null;
        }
      }
    }
    setGrid(newGrid);
    setBombMode(false);
    checkRevive(newGrid);
    confetti({ 
      particleCount: 80, 
      colors: ['#f43f5e', '#fbbf24'],
      origin: { y: 0.7 } 
    });
  }, [grid, score, saveHistory, GRID_SIZE, checkRevive]);

  React.useImperativeHandle(engineRef, () => ({
    useZap,
    useBomb,
    useUndo,
    useSwap,
    useHammer,
    reset: initGame,
    isRestricted: isRestrictedState
  }));
  
  const getSeededRandom = useCallback((moveIdx: number, offset: number = 0) => {
    if (seed === undefined) return Math.random();
    // Deterministic pseudo-random based on seed + move index + internal offset
    const x = Math.sin(seed + moveIdx * 13.37 + offset * 42.42) * 10000;
    return x - Math.floor(x);
  }, [seed]);

  const generateTile = useCallback((pos: Point, moveIdx: number, offset: number, valueOverride?: number): Tile => {
    const rand = getSeededRandom(moveIdx, offset);
    const value = valueOverride || (rand < 0.9 ? 2 : 4);
    return {
      id: `${moveIdx}-${offset}-${pos.x}-${pos.y}`,
      value,
      x: pos.x,
      y: pos.y
    };
  }, [getSeededRandom]);

  const addRandomTile = useCallback((currentGrid: (Tile | null)[][], moveIdx: number) => {
    const emptyCells: Point[] = [];
    currentGrid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) emptyCells.push({ x, y });
      });
    });

    if (emptyCells.length === 0) return currentGrid;
    
    const randIdx = getSeededRandom(moveIdx, 100);
    const randomCell = emptyCells[Math.floor(randIdx * emptyCells.length)];
    const newGrid = [...currentGrid.map(row => [...row])];
    newGrid[randomCell.y][randomCell.x] = generateTile(randomCell, moveIdx, 200);
    return newGrid;
  }, [generateTile, getSeededRandom]);

  const initGame = useCallback(() => {
    let initialGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    initialGrid = addRandomTile(initialGrid, -1); // moveIdx -1 for init phase 1
    initialGrid = addRandomTile(initialGrid, -2); // moveIdx -2 for init phase 2
    setGrid(initialGrid);
    setScore(0);
    setMovesCount(0);
    setSessionMaxCombo(0);
    setHistory([]);
    setGameOver(false);
    setBombMode(false);
  }, [addRandomTile, GRID_SIZE]);

  useEffect(() => {
    initGame();
  }, [initGame, difficulty]);

  const move = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver || bombMode || isDisabled) return;
    
    saveHistory(grid, score);
    let moved = false;
    let newScore = score;
    let mergesInMove = 0;
    const getVector = (dir: string) => {
      switch (dir) {
        case 'up': return { x: 0, y: -1 };
        case 'down': return { x: 0, y: 1 };
        case 'left': return { x: -1, y: 0 };
        case 'right': return { x: 1, y: 0 };
        default: return { x: 0, y: 0 };
      }
    };

    const vector = getVector(direction);
    const traversals = {
      x: Array.from({ length: GRID_SIZE }, (_, i) => i),
      y: Array.from({ length: GRID_SIZE }, (_, i) => i)
    };

    if (vector.x === 1) traversals.x.reverse();
    if (vector.y === 1) traversals.y.reverse();

    const newGrid = grid.map(row => [...row]);

    traversals.y.forEach(y => {
      traversals.x.forEach(x => {
        const tile = newGrid[y][x];
        if (tile) {
          let farX = x;
          let farY = y;
          let nextX = x + vector.x;
          let nextY = y + vector.y;
          
          while (nextX >= 0 && nextX < GRID_SIZE && nextY >= 0 && nextY < GRID_SIZE && !newGrid[nextY][nextX]) {
            farX = nextX;
            farY = nextY;
            nextX += vector.x;
            nextY += vector.y;
          }

          if (nextX >= 0 && nextX < GRID_SIZE && nextY >= 0 && nextY < GRID_SIZE) {
            const nextTile = newGrid[nextY][nextX];
            if (nextTile && nextTile.value === tile.value) {
              const merged = { ...tile, value: tile.value * 2, x: nextX, y: nextY };
              newGrid[nextY][nextX] = merged;
              newGrid[y][x] = null;
              newScore += merged.value * config.multiplier;
              moved = true;
              mergesInMove++;
              
              if (merged.value === config.target) {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
              }

              // Credits Milestones
              if (user && (merged.value === 2048 || merged.value === 4096)) {
                const reward = merged.value === 2048 ? 500 : 1000;
                addGold(user.uid, reward);
                confetti({ 
                  particleCount: 100, 
                  colors: ['#fbbf24', '#f43f5e'],
                  origin: { x: Math.random(), y: 0.5 } 
                });
              }
              return;
            }
          }

          if (farX !== x || farY !== y) {
            newGrid[farY][farX] = { ...tile, x: farX, y: farY };
            newGrid[y][x] = null;
            moved = true;
          }
        }
      });
    });

    if (moved) {
      const gridWithNew = addRandomTile(newGrid, movesCount);
      setGrid(gridWithNew);
      setScore(Math.floor(newScore));
      setMovesCount(prev => prev + 1);
      onMove?.(Math.floor(newScore));

      const newMaxCombo = Math.max(sessionMaxCombo, mergesInMove);
      setSessionMaxCombo(newMaxCombo);

      const isGameOver = !canMove(gridWithNew);
      if (isGameOver) {
        setGameOver(true);
        onGameOver(Math.floor(newScore));
        if (user) {
          saveScore(user.uid, user.displayName || 'Anonymous', Math.floor(newScore), difficulty);
          updateUserXP(user.uid, Math.floor(newScore));
          updateGameStats(user.uid, Math.floor(newScore), newMaxCombo);
        }
      }
    } else {
      setHistory(prev => prev.slice(0, -1));
    }
  }, [grid, score, gameOver, addRandomTile, onGameOver, user, bombMode, saveHistory, GRID_SIZE, config.multiplier, config.target]);

  const canMove = (currentGrid: (Tile | null)[][]) => {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!currentGrid[y][x]) return true;
        const value = currentGrid[y][x]?.value;
        if (x < GRID_SIZE - 1 && currentGrid[y][x + 1]?.value === value) return true;
        if (y < GRID_SIZE - 1 && currentGrid[y + 1][x]?.value === value) return true;
      }
    }
    return false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'w', 'W'].includes(e.key)) move('up');
      if (['ArrowDown', 's', 'S'].includes(e.key)) move('down');
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) move('left');
      if (['ArrowRight', 'd', 'D'].includes(e.key)) move('right');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  // Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(containerRef.current?.offsetWidth || 400, 400);
    canvas.width = size;
    canvas.height = size;
    
    const padding = Math.max(8, 16 - GRID_SIZE * 2);
    const tileSize = (size - (GRID_SIZE + 1) * padding) / GRID_SIZE;

    const render = () => {
      ctx.clearRect(0, 0, size, size);
      
      // Grid Background
      ctx.fillStyle = THEME.gridBackground;
      ctx.beginPath();
      ctx.roundRect?.(0, 0, size, size, 24);
      ctx.fill();

      // Empty Cells
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          ctx.fillStyle = bombMode ? '#450a0a' : THEME.emptyTile;
          const tx = padding + x * (tileSize + padding);
          const ty = padding + y * (tileSize + padding);
          ctx.beginPath();
          ctx.roundRect?.(tx, ty, tileSize, tileSize, 12);
          ctx.fill();
        }
      }

      // Tiles
      grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          if (tile) {
            const tx = padding + x * (tileSize + padding);
            const ty = padding + y * (tileSize + padding);
            const color = THEME.neon[tile.value as keyof typeof THEME.neon] || '#fff';
            
            ctx.shadowBlur = tile.value >= 128 ? 20 : 0;
            ctx.shadowColor = color;
            
            const isTargeted = bombMode || hammerMode || swapMode.active;
            const isSelected = swapMode.firstSelection?.x === x && swapMode.firstSelection?.y === y;

            ctx.fillStyle = isTargeted ? (isSelected ? '#fff' : '#404040') : color;
            ctx.beginPath();
            ctx.roundRect?.(tx, ty, tileSize, tileSize, 12);
            ctx.fill();
            
            if (isSelected) {
              ctx.strokeStyle = '#f472b6';
              ctx.lineWidth = 4;
              ctx.strokeRect(tx, ty, tileSize, tileSize);
            }

            ctx.shadowBlur = 0;
            
            ctx.fillStyle = isTargeted ? (isSelected ? '#000' : '#737373') : (['#a3e635'].includes(color) ? '#000' : '#fff');
            ctx.font = `italic 900 ${tileSize * (GRID_SIZE > 4 ? 0.35 : 0.45)}px Inter`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tile.value.toString(), tx + tileSize / 2, ty + tileSize / 2);
          }
        });
      });

      if (bombMode || hammerMode || swapMode.active) {
        ctx.strokeStyle = bombMode ? '#f43f5e' : hammerMode ? '#a8a29e' : '#f472b6';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(4, 4, size-8, size-8);
        ctx.setLineDash([]);
      }
    };

    render();
  }, [grid, bombMode, hammerMode, swapMode]);

  const handleCanvasAction = (x: number, y: number) => {
    if (bombMode) {
      handleBombClick(x, y);
    } else if (hammerMode) {
      handleHammerClick(x, y);
    } else if (swapMode.active) {
      handleSwapClick(x, y);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if ((!bombMode && !hammerMode && !swapMode.active) || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const size = canvasRef.current.width;
    const padding = Math.max(8, 16 - GRID_SIZE * 2);
    const tileSize = (size - (GRID_SIZE + 1) * padding) / GRID_SIZE;
    
    const gridX = Math.floor((x - padding) / (tileSize + padding));
    const gridY = Math.floor((y - padding) / (tileSize + padding));
    
    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
      handleCanvasAction(gridX, gridY);
    }
  };

  // Touch and Swipe Support
  const touchStart = useRef<Point | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (bombMode || hammerMode || swapMode.active) {
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const size = rect.width;
      const padding = Math.max(8, 16 - GRID_SIZE * 2);
      const tileSize = (size - (GRID_SIZE + 1) * padding) / GRID_SIZE;
      const gridX = Math.floor((x - padding) / (tileSize + padding));
      const gridY = Math.floor((y - padding) / (tileSize + padding));
      if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
        handleCanvasAction(gridX, gridY);
      }
      return;
    }
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (bombMode) return;
    if (!touchStart.current) return;
    
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 20) { // threshold
      if (absX > absY) {
        move(dx > 0 ? 'right' : 'left');
      } else {
        move(dy > 0 ? 'down' : 'up');
      }
    }
    touchStart.current = null;
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full max-w-[400px] aspect-square mx-auto touch-none overflow-visible select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <canvas 
        ref={canvasRef} 
        className={`w-full h-full rounded-3xl ${bombMode || swapMode.active || hammerMode ? 'cursor-crosshair ring-4 ring-rose-500' : 'cursor-pointer'}`}
        onClick={handleCanvasClick}
      />
      
      <AnimatePresence>
        {(bombMode || swapMode.active || hammerMode) && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-12 left-0 right-0 text-center z-50 px-4"
          >
            <div className="bg-rose-500 text-white px-4 py-2 font-black uppercase text-[10px] tracking-widest inline-flex items-center gap-2 shadow-2xl rounded-sm">
              <span className="animate-pulse">
                {bombMode ? 'Select Domain (3x3)' : 
                 hammerMode ? 'Target Block for Removal' :
                 swapMode.firstSelection ? 'Select Second Anchor' : 'Select Initial Anchor'}
              </span>
              <button 
                onClick={() => {
                  setBombMode(false);
                  setHammerMode(false);
                  setSwapMode({ active: false, firstSelection: null });
                }}
                className="ml-2 hover:bg-white hover:text-rose-500 px-1 rounded transition-colors"
              >
                ESC
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {gameOver && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-neutral-950/90 backdrop-blur-md flex flex-col items-center justify-center rounded-3xl z-20 border-4 border-rose-500"
          >
            <h2 className="text-6xl font-black text-rose-500 mb-2 uppercase tracking-tighter italic leading-none">System<br/>Fail</h2>
            <p className="text-white text-xl font-mono mb-6 uppercase tracking-widest opacity-50">Pulse Reached: {score}</p>
            <div className="flex flex-col gap-3 w-3/4">
              <button 
                onClick={initGame}
                className="w-full py-4 bg-white text-black font-black uppercase tracking-widest hover:bg-lime-400 transition-colors"
              >
                Reboot Circuit
              </button>
              <p className="text-[10px] font-black text-blue-400 uppercase text-center mt-2 animate-pulse">
                &gt; Use power-ups from Arsenal to manually revive
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
