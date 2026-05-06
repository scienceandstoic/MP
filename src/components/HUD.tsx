import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Zap, Ghost, User as UserIcon, LogOut, Info, Settings, Share2, Calendar, ShoppingBag, X, ChevronDown, Users, Clock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { GameEngine, GameEngineHandle } from '../game/GameEngine';
import { getLeaderboard, deductGold } from '../lib/db';
import { DIFFICULTIES, Difficulty, RANKS } from '../game/types';
import { MultiplayerMenu } from './MultiplayerMenu';
import { updatePlayerScore, subscribeToPlayers, setPlayerStatus, PlayerStatus, RoomStatus, subscribeToRoom } from '../services/MultiplayerService';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export default function GameContainer() {
  const { user, profile, login, logout, loading } = useAuth();
  const engineRef = useRef<GameEngineHandle>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [boardDifficulty, setBoardDifficulty] = useState<Difficulty>('medium');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showTutorial, setShowTutorial] = useState(true);
  const [currentScore, setCurrentScore] = useState(0);
  const [showArsenal, setShowArsenal] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  
  const [activeBattle, setActiveBattle] = useState<{
    roomId: string;
    seed: number;
    duration: number;
    difficulty: Difficulty;
    timeLeft: number;
    players: any[];
  } | null>(null);

  const [confirmingPowerup, setConfirmingPowerup] = useState<(typeof powerups[0]) | null>(null);
  const [isProcessingPowerup, setIsProcessingPowerup] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showDiffMenu, setShowDiffMenu] = useState(false);

  const currentRank = RANKS.reduce((prev, curr) => {
    if ((profile?.level || 1) >= curr.minLevel) return curr;
    return prev;
  }, RANKS[0]);

  const powerups = [
    { id: 'zap', name: 'ZAP', icon: '⚡', cost: 100, desc: 'Removes all "2" tiles from the board.', action: () => engineRef.current?.useZap() },
    { id: 'bomb', name: 'BOMB', icon: '💣', cost: 250, desc: 'Clears a 3x3 area around a selected tile.', action: () => engineRef.current?.useBomb() },
    { id: 'swap', name: 'SWAP', icon: '🔁', cost: 300, desc: 'Relocate two tiles by swapping their coordinates.', action: () => engineRef.current?.useSwap() },
    { id: 'hammer', name: 'HAMMER', icon: '🔨', cost: 200, desc: 'Permanently deletes any single tile from the matrix.', action: () => engineRef.current?.useHammer() },
    { id: 'undo', name: 'UNDO', icon: '🔄', cost: 50, desc: 'Reverts the board to the previous state.', action: () => engineRef.current?.useUndo() },
  ];

  const usePowerup = (p: typeof powerups[0]) => {
    if (!user) {
      login();
      return;
    }
    if (activeBattle) return; // No powerups in multiplayer
    const currentGold = profile?.gold || 0;
    if (currentGold < p.cost) {
      setConfirmingPowerup(null);
      return;
    }
    setConfirmingPowerup(p);
  };

  const handleConfirmPurchase = async () => {
    if (!confirmingPowerup || !user) return;
    const p = confirmingPowerup;
    setIsProcessingPowerup(true);
    
    // Artificial delay for "processing" feel
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      await deductGold(user.uid, p.cost);
      p.action();
      setConfirmingPowerup(null);
      setShowArsenal(false);
    } catch (error) {
      console.error("Failed to purchase powerup", error);
    } finally {
      setIsProcessingPowerup(false);
    }
  };

  useEffect(() => {
    if (showBoard) {
      getLeaderboard(boardDifficulty).then(setLeaderboard);
    }
  }, [showBoard, boardDifficulty]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Merge Pulse',
        text: 'Syncing at high intensity. Check my score!',
        url: window.location.href,
      }).catch(console.error);
    }
  };

  useEffect(() => {
    if (activeBattle && activeBattle.timeLeft > 0) {
      const timer = setInterval(() => {
        setActiveBattle(prev => prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null);
      }, 1000);
      return () => clearInterval(timer);
    } else if (activeBattle && activeBattle.timeLeft === 0) {
      // Battle finished
      if (user) {
        setPlayerStatus(activeBattle.roomId, user.uid, PlayerStatus.FINISHED);
        
        // If host, mark room as finished too
        const roomRef = doc(db, 'multiplayerRooms', activeBattle.roomId);
        getDoc(roomRef).then(snap => {
          if (snap.exists() && snap.data().hostId === user.uid) {
            updateDoc(roomRef, { status: RoomStatus.FINISHED });
          }
        });
      }
    }
  }, [activeBattle?.timeLeft, user]);

  useEffect(() => {
    if (activeBattle && user) {
      const unsubPlayers = subscribeToPlayers(activeBattle.roomId, (players) => {
        setActiveBattle(prev => prev ? { ...prev, players } : null);
      });
      const unsubRoom = subscribeToRoom(activeBattle.roomId, (room) => {
        if (room.status === RoomStatus.FINISHED) {
           // Maybe show final scores
        }
      });
      return () => {
        unsubPlayers();
        unsubRoom();
      };
    }
  }, [activeBattle?.roomId, user]);

  const handleScoreUpdate = (score: number) => {
    setCurrentScore(score);
    if (activeBattle && user) {
      updatePlayerScore(activeBattle.roomId, user.uid, score);
    }
  };

  const handleBattleStart = (config: { roomId: string; seed: number; duration: number; difficulty: Difficulty }) => {
    setDifficulty(config.difficulty);
    setActiveBattle({
      ...config,
      timeLeft: config.duration,
      players: []
    });
    setShowMultiplayer(false);
    if (user) {
      setPlayerStatus(config.roomId, user.uid, PlayerStatus.PLAYING);
    }
  };

  const finishBattle = () => {
    setActiveBattle(null);
    setCurrentScore(0);
    setShowMultiplayer(true); // Go back to lobby to see results
  };

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-16 h-16 border-4 border-lime-400 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col p-8 overflow-hidden select-none relative">
      {/* TOP NAVIGATION / METRICS */}
      <div className="flex justify-between items-start mb-8 max-w-[1280px] mx-auto w-full px-4">
        <div className="flex flex-col">
          <h1 className="text-8xl font-black italic tracking-tighter leading-none text-lime-400 uppercase">
            Merge<br/>Pulse
          </h1>
          <p className="text-xs font-mono mt-2 tracking-widest text-neutral-500 uppercase">Season 01: Neon Core</p>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <p className="text-xs font-bold text-neutral-500 uppercase mb-1 font-mono">Intensity (x{DIFFICULTIES[difficulty].multiplier})</p>
            <p className="text-6xl font-black tabular-nums leading-none tracking-tighter" style={{ color: DIFFICULTIES[difficulty].color }}>{currentScore.toLocaleString()}</p>
          </div>
    <div className="text-right">
      <p className="text-xs font-bold text-neutral-500 uppercase mb-1 font-mono">Credits</p>
      <p className="text-6xl font-black text-rose-500 leading-none underline decoration-4 underline-offset-8">
        {(user ? (profile?.gold ?? 0) : 100).toLocaleString()}
      </p>
    </div>
          {user && (
            <div className="text-right">
              <p className="text-xs font-bold uppercase mb-1" style={{ color: currentRank.color }}>{currentRank.name}</p>
              <div className="flex items-center gap-2 justify-end">
                <div className="flex flex-col items-end">
                  <p className="text-2xl font-black italic leading-none">{user.displayName?.split(' ')[0]}</p>
                  <p className="text-[10px] font-mono text-neutral-500 mt-1 uppercase">Level {profile?.level || 1}</p>
                </div>
                <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2" style={{ borderColor: currentRank.color }} />
              </div>
              <button onClick={logout} className="text-[10px] font-bold uppercase text-neutral-500 hover:text-white mt-1">Logout</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 gap-8 overflow-hidden max-w-[1280px] mx-auto w-full h-[600px] px-4">
        {/* LEFT COLUMN: PROGRESSION */}
        <div className="w-64 hidden xl:flex flex-col gap-6">
          <div className="bg-neutral-900 border-l-4 border-lime-400 p-4">
            <p className="text-xs font-black uppercase tracking-tighter mb-4 text-neutral-400">Daily Streak</p>
            <div className="flex justify-between items-end">
              <span className="text-5xl font-black">{profile?.loginStreak.toString().padStart(2, '0') || '01'}</span>
              <span className="text-xs font-bold pb-1 text-lime-400">PULSE STREAK</span>
            </div>
            <div className="w-full bg-neutral-800 h-1 mt-4">
              <div className="bg-lime-400 h-full transition-all duration-1000" style={{ width: `${Math.min((profile?.loginStreak || 1) * 20, 100)}%` }}></div>
            </div>
          </div>

          <div className="flex-1 bg-neutral-900 p-4 flex flex-col overflow-hidden">
            <p className="text-xs font-black uppercase mb-4 text-neutral-400">Top Runners</p>
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {leaderboard.slice(0, 5).map((entry, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-xs italic border border-neutral-700 uppercase">
                    {entry.displayName[0]}
                  </div>
                  <div className="flex-1"><p className="text-sm font-bold truncate uppercase">{entry.displayName}</p></div>
                  <p className="text-xs font-mono text-neutral-500">{entry.score > 1000 ? (entry.score/1000).toFixed(1)+'K' : entry.score}</p>
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-xs opacity-50 italic">Syncing hall of fame...</p>}
            </div>
            <div className="mt-auto pt-4 text-center">
              <button 
                onClick={() => setShowBoard(true)}
                className="w-full py-3 bg-neutral-800 border-2 border-transparent hover:border-lime-400 text-neutral-500 hover:text-white font-black text-xs uppercase tracking-widest transition-all"
              >
                View Global Hall
              </button>
            </div>
          </div>
        </div>

        {/* MAIN GAME BOARD */}
        <div className="flex-1 bg-neutral-900 flex flex-col items-center justify-center border-4 border-neutral-800 rounded-[3rem] relative overflow-hidden backdrop-blur-sm">
          {activeBattle && (
            <div className="absolute top-0 left-0 right-0 p-6 z-30 flex justify-between items-center bg-black/40 backdrop-blur-md border-b-2 border-neutral-800">
               <div className="flex items-center gap-4">
                  <div className="bg-rose-500 p-2 rounded-sm">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-500">Battle Time</p>
                    <p className={`text-2xl font-black font-mono leading-none ${activeBattle.timeLeft < 30 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                      {Math.floor(activeBattle.timeLeft / 60)}:{(activeBattle.timeLeft % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
               </div>
               
               <div className="flex gap-2">
                 {activeBattle.players.sort((a,b) => b.score - a.score).slice(0, 3).map((p, i) => (
                   <div key={p.userId} className={`px-4 py-2 flex flex-col items-center border ${p.userId === user?.uid ? 'border-lime-400 bg-lime-400/10' : 'border-neutral-800 bg-neutral-900'}`}>
                      <p className="text-[8px] font-black uppercase text-neutral-500">{i === 0 ? 'Leader' : `P${i+1}`}</p>
                      <p className="text-sm font-black italic">{p.score}</p>
                   </div>
                 ))}
               </div>

               <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-neutral-500">Your Pulse</p>
                  <p className="text-3xl font-black italic text-lime-400 leading-none">{currentScore}</p>
               </div>
            </div>
          )}

          {activeBattle && activeBattle.timeLeft === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-10"
            >
               <h2 className="text-6xl font-black italic uppercase tracking-tighter text-lime-400 mb-8">Sequence Finalized</h2>
               <div className="w-full max-w-sm space-y-4 mb-12">
                  {activeBattle.players.sort((a,b) => b.score - a.score).map((p, i) => (
                    <div key={p.userId} className={`flex items-center justify-between p-4 ${p.userId === user?.uid ? 'bg-lime-400 text-black' : 'bg-neutral-900 text-white'}`}>
                       <div className="flex items-center gap-4">
                          <span className="font-mono text-xl">#{i+1}</span>
                          <span className="font-black uppercase italic">{p.displayName}</span>
                       </div>
                       <span className="font-black text-2xl">{p.score}</span>
                    </div>
                  ))}
               </div>
               <button 
                 onClick={finishBattle}
                 className="px-12 py-4 bg-white text-black font-black uppercase tracking-widest hover:bg-lime-400 transition-all transform hover:-translate-y-1"
               >
                 Terminate Match
               </button>
            </motion.div>
          )}

          {/* Circuit details overlay */}
          <div className="absolute top-8 left-8 flex flex-col opacity-20 pointer-events-none">
            <span className="text-[10px] font-mono leading-tight whitespace-pre font-bold">
              SYS::PULSE_SYNC_ACTIVE<br/>
              NOD::0xFF2A_77<br/>
              VER::1.2.0
            </span>
          </div>
          
          <div className="w-full h-full flex flex-col items-center justify-center scale-90 sm:scale-100">
            {!activeBattle && (
              <div className="mb-6 flex gap-2">
                {Object.entries(DIFFICULTIES).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDifficulty(key as Difficulty);
                      engineRef.current?.reset();
                    }}
                    className={`px-3 py-1 text-[10px] font-black italic border-2 transition-all ${
                      difficulty === key 
                        ? 'bg-white text-black border-white' 
                        : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'
                    }`}
                  >
                    {cfg.name}
                  </button>
                ))}
              </div>
            )}
            <GameEngine 
              engineRef={engineRef} 
              onGameOver={(final) => {
                if (!activeBattle) {
                  // regular game over
                }
              }} 
              onScoreChange={handleScoreUpdate} 
              difficulty={difficulty}
              seed={activeBattle?.seed}
              multiplayerMode={!!activeBattle}
              isDisabled={activeBattle?.timeLeft === 0}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: EVENTS & ARSENAL TOGGLE */}
        <div className="w-64 hidden xl:flex flex-col gap-6">
          <div className="flex-[2] bg-rose-500 p-6 flex flex-col relative overflow-hidden group cursor-pointer" onClick={() => setShowArsenal(true)}>
             <div className="relative z-10">
                <h2 className="text-5xl font-black uppercase leading-none mb-1 italic">Arsenal</h2>
                <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">Augment Subsystem</p>
             </div>
            <div className="mt-auto relative z-10">
              <p className="text-[10px] font-black uppercase mb-1 opacity-50">Arsenal Status</p>
              <div className="flex gap-1.5 flex-wrap">
                 {powerups.map(p => (
                   <div key={p.id} className="w-6 h-6 border border-black/20 flex items-center justify-center font-bold text-[10px] bg-black/10 text-black/50">
                     {p.icon}
                   </div>
                 ))}
              </div>
            </div>
            <ShoppingBag className="absolute -right-6 -top-6 w-32 h-32 opacity-10 group-hover:rotate-12 transition-transform duration-500" />
            <div className="absolute bottom-6 right-6 w-10 h-10 border-2 border-black flex items-center justify-center font-black group-hover:bg-black group-hover:text-rose-500 transition-all">
                →
            </div>
          </div>

          <div className="flex-1 bg-blue-600 p-6 flex flex-col relative overflow-hidden group cursor-pointer" onClick={() => setShowStats(true)}>
            <div className="relative z-10">
              <h2 className="text-4xl font-black uppercase leading-none mb-1 italic">Stats</h2>
              <p className="text-xs font-black uppercase tracking-[0.2em] opacity-80">Performance Log</p>
            </div>
            <div className="mt-auto relative z-10">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-black leading-none">{profile?.totalGames || 0}</span>
                <span className="text-[10px] font-bold uppercase opacity-60 mb-1">RUNS</span>
              </div>
            </div>
            <UserIcon className="absolute -right-4 -top-4 w-24 h-24 opacity-10 group-hover:scale-110 transition-transform duration-500" />
            <div className="absolute bottom-6 right-6 w-8 h-8 border-2 border-black flex items-center justify-center font-black group-hover:bg-black group-hover:text-blue-600 transition-all">
              →
            </div>
          </div>

          <div className="bg-neutral-900 p-4 border-r-4 border-lime-400">
            <p className="text-xs font-black uppercase mb-3 text-neutral-400">Sync Goals</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold mb-2">
                  <span>MERGE 1024</span>
                  <span className="text-neutral-500">0/1</span>
                </div>
                <div className="w-full bg-neutral-800 h-1">
                  <div className="bg-blue-500 h-full w-[10%]"></div>
                </div>
              </div>
              <button 
                onClick={!user ? login : handleShare}
                className="w-full py-4 mt-2 bg-lime-400 text-black font-black uppercase text-xs tracking-tighter hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                {!user ? 'LOGIN SYNC' : 'BROADCAST SCORE'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ARSENAL DRAWER */}
      <AnimatePresence>
        {showArsenal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowArsenal(false)}
              className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-neutral-900 border-l-4 border-rose-500 z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-neutral-800 flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-black uppercase italic italic text-rose-500">Arsenal</h2>
                  <p className="text-[10px] font-mono uppercase text-neutral-500 tracking-widest">Active Upgrades</p>
                </div>
                <button 
                  onClick={() => setShowArsenal(false)}
                  className="w-10 h-10 rounded-full hover:bg-neutral-800 flex items-center justify-center transition-colors"
                >
                  <X />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative">
                <AnimatePresence>
                  {confirmingPowerup && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute inset-x-8 top-8 bottom-8 bg-neutral-950 border-2 border-rose-500 z-50 p-6 flex flex-col justify-center items-center text-center shadow-2xl"
                    >
                      <div className="text-4xl mb-4 bg-rose-500/10 p-4 rounded-sm border border-rose-500/20">
                        {confirmingPowerup.icon}
                      </div>
                      <h3 className="text-2xl font-black uppercase italic italic text-white mb-2">Initialize {confirmingPowerup.name}?</h3>
                      <p className="text-xs text-neutral-500 font-bold uppercase mb-8 leading-relaxed">
                        This operation will consume <span className="text-rose-500">{confirmingPowerup.cost} Credits</span>.
                        <br/>
                        Remaining: <span className="text-white">{(profile?.gold || 0) - confirmingPowerup.cost} CR</span>
                      </p>
                      
                      <div className="flex flex-col gap-2 w-full">
                        <button 
                          onClick={handleConfirmPurchase}
                          disabled={isProcessingPowerup}
                          className="w-full py-4 bg-rose-500 text-white font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                          {isProcessingPowerup ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Syncing...
                            </>
                          ) : 'Confirm & Activate'}
                        </button>
                        {!isProcessingPowerup && (
                          <button 
                            onClick={() => setConfirmingPowerup(null)}
                            className="w-full py-4 border-2 border-neutral-800 text-neutral-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-all"
                          >
                            Cancel Transaction
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {engineRef.current?.isRestricted() && (
                  <div className="p-4 bg-rose-500/10 border-2 border-rose-500/20 rounded-lg mb-4">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest leading-relaxed">
                      ⚠️ AUGMENT_LOCKED: Field strictly uniform (2s only). Increase complexity to engage power-ups.
                    </p>
                  </div>
                )}
                {powerups.map((p) => (
                  <motion.div 
                    key={p.id}
                    whileHover={{ x: -4 }}
                    className="group"
                  >
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-12 h-12 bg-neutral-800 border-2 border-neutral-700 flex items-center justify-center text-2xl group-hover:border-rose-500 group-hover:text-rose-500 transition-colors">
                        {p.icon}
                      </div>
                      <div>
                        <h4 className="font-black text-xl italic tracking-tight">{p.name}</h4>
                        <span className="text-[10px] bg-rose-500/10 text-rose-500 px-2 py-0.5 font-bold uppercase">{p.cost} CR</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 font-bold uppercase leading-relaxed mb-4">
                      {p.desc}
                    </p>
                    <button 
                      onClick={() => usePowerup(p)}
                      disabled={!profile || profile.gold < p.cost || engineRef.current?.isRestricted()}
                      className="w-full py-3 border-2 border-neutral-800 font-black uppercase text-[10px] tracking-widest hover:bg-white hover:text-black hover:border-white transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      {(!profile || profile.gold < p.cost) ? 'Insufficient CR' : engineRef.current?.isRestricted() ? 'Locked' : 'Init Upgrade'}
                    </button>
                  </motion.div>
                ))}
              </div>

              <div className="p-8 bg-neutral-950 border-t border-neutral-800">
                <p className="text-[10px] font-mono text-neutral-500 mb-2 uppercase">Available Balance</p>
                <p className="text-4xl font-black text-rose-500 tracking-tighter">{profile?.gold?.toLocaleString() || '0'} CR</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FOOTER UI */}
      <div className="mt-8 max-w-[1280px] mx-auto w-full px-4 pt-4 border-t border-neutral-900 flex justify-between items-center text-[10px] font-black tracking-[0.2em] uppercase text-neutral-600">
        <div className="flex gap-10">
          <span className="text-white border-b-2 border-lime-400 pb-1 cursor-pointer">Circuit</span>
          <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setShowBoard(true)}>Hall</span>
          <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setShowArsenal(true)}>Arsenal</span>
          <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setShowMultiplayer(true)}>Network</span>
        </div>
        <div className="hidden sm:block font-mono opacity-30">
          LOCATION: ASIA-EAST-1 // STATUS: NOMINAL
        </div>
      </div>

      {/* Multiplayer Modal */}
      <AnimatePresence>
        {showMultiplayer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl z-50 p-6 overflow-y-auto"
          >
            <MultiplayerMenu 
              onClose={() => setShowMultiplayer(false)} 
              onGameStart={handleBattleStart}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statistics Modal */}
      <AnimatePresence>
        {showStats && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl z-50 p-6 overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto pt-20">
              <div className="flex justify-between items-end mb-16">
                <div>
                  <h2 className="text-8xl font-black italic uppercase tracking-tighter leading-none text-blue-500">Log</h2>
                  <h3 className="text-neutral-500 font-mono tracking-[0.3em] uppercase text-[10px] mt-4">Session & Performance Analytics</h3>
                </div>
                <button 
                  onClick={() => setShowStats(false)} 
                  className="px-8 py-3 bg-white text-black font-black uppercase text-xs hover:bg-blue-600 hover:text-white transition-all transform hover:-translate-y-1 active:translate-y-0"
                >
                  Terminate View
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-neutral-900/50 border-l-4 border-blue-500 p-8 flex flex-col justify-between h-48">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Total Operations</p>
                  <div>
                    <span className="text-6xl font-black italic leading-none">{profile?.totalGames || 0}</span>
                    <p className="text-[10px] font-mono text-blue-400 mt-2 tracking-widest uppercase">SYMBOLS SYNCED</p>
                  </div>
                </div>

                <div className="bg-neutral-900/50 border-l-4 border-lime-400 p-8 flex flex-col justify-between h-48">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Efficiency Rating</p>
                  <div>
                    <span className="text-5xl font-black italic leading-none">
                      {profile?.totalGames ? Math.floor(profile.totalScoreSum / profile.totalGames).toLocaleString() : '0'}
                    </span>
                    <p className="text-[10px] font-mono text-lime-400 mt-2 tracking-widest uppercase">AVG. PULSE INTENSITY</p>
                  </div>
                </div>

                <div className="bg-neutral-900/50 border-l-4 border-rose-500 p-8 flex flex-col justify-between h-48">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Critical Peak</p>
                  <div>
                    <span className="text-6xl font-black italic leading-none">{profile?.highScore || 0}</span>
                    <p className="text-[10px] font-mono text-rose-500 mt-2 tracking-widest uppercase">MAX VOLTAGE REACHED</p>
                  </div>
                </div>

                <div className="bg-neutral-900/50 border-l-4 border-amber-400 p-8 flex flex-col justify-between h-48">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">Highest Resonance</p>
                  <div>
                    <span className="text-6xl font-black italic leading-none">{profile?.maxCombo || 0}</span>
                    <p className="text-[10px] font-mono text-amber-400 mt-2 tracking-widest uppercase">MAX COMBO STREAK</p>
                  </div>
                </div>
              </div>

              <div className="mt-12 p-8 bg-blue-600/5 border border-blue-500/20 rounded-sm">
                <p className="text-[10px] font-mono text-blue-500 leading-relaxed uppercase tracking-wider">
                  &gt; DATA_INTEGRITY: NOMINAL // ALL PERFORMANCE BYTES AUTHENTICATED VIA NEON_CORE PROTOCOL.
                  <br/>
                  &gt; NEXT_MILESTONE: REACH LEVEL {(profile?.level || 0) + 1} TO UNLOCK ADVANCED ARSENAL CAPABILITIES.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {showBoard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl z-50 p-6 overflow-y-auto"
          >
            <div className="max-w-md mx-auto pt-10">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none text-lime-400">Ranking</h2>
                  <h3 className="text-neutral-500 font-mono tracking-[0.3em] uppercase text-[10px] mt-4">Hall of Pulse Runners</h3>
                </div>
                <button 
                  onClick={() => setShowBoard(false)} 
                  className="px-6 py-2 bg-white text-black font-black uppercase text-xs hover:bg-rose-500 transition-colors"
                >
                  Return
                </button>
              </div>

              <div className="flex gap-2 mb-8 bg-neutral-900 p-1 rounded-sm">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setBoardDifficulty(d)}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                      boardDifficulty === d 
                        ? 'bg-lime-400 text-black' 
                        : 'text-neutral-500 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {leaderboard.length === 0 ? (
                  <div className="text-center py-20 border-4 border-dashed border-neutral-900">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600">No resonance logs found for this sector</p>
                  </div>
                ) : (
                  leaderboard.map((entry, i) => (
                    <motion.div 
                      key={i}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex items-center justify-between p-5 bg-neutral-900 border-l-4 ${entry.userId === user?.uid ? 'border-lime-400' : 'border-blue-500'}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-black italic text-neutral-700">{(i + 1).toString().padStart(2, '0')}</span>
                        <div className="text-lg font-black uppercase italic tracking-tight">{entry.displayName}</div>
                      </div>
                      <div className="font-mono text-lime-400 font-bold text-xl">{entry.score.toLocaleString()}</div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-lime-400/5 backdrop-blur-sm z-40 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-neutral-950 border-4 border-white p-10 max-w-sm w-full relative"
            >
              <h2 className="text-5xl font-black italic uppercase tracking-tighter mb-6 leading-none">Access<br/>Granted</h2>
              <div className="space-y-6 text-xs text-neutral-400 font-bold leading-relaxed uppercase tracking-wide">
                <p>Sync <span className="text-lime-400">identical intensities</span> to generate higher order pulses.</p>
                <div className="flex items-center gap-4 p-4 bg-neutral-900">
                  <div className="w-12 h-12 bg-lime-400 flex items-center justify-center font-black text-black text-xl">2</div>
                  <div className="text-2xl italic text-neutral-700">→</div>
                  <div className="w-12 h-12 border-2 border-lime-400 flex items-center justify-center font-black text-lime-400 text-xl">4</div>
                </div>
                <p>Achieve the <span className="text-white">Critical 2048</span> to transcend the grid.</p>
                <p className="font-mono text-[9px] text-neutral-600">INPUT: Swipe / WASD to move entire field.</p>
              </div>
              <button 
                onClick={() => setShowTutorial(false)}
                className="w-full mt-10 py-5 bg-lime-400 text-black font-black uppercase tracking-widest hover:bg-white transition-colors"
              >
                Enter Circuit
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
