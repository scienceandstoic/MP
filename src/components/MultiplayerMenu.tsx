import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, Clock, Play, LogOut, Copy, Check, Trophy } from 'lucide-react';
import { 
  createRoom, 
  joinRoom, 
  subscribeToRoom, 
  subscribeToPlayers, 
  startRoomGame, 
  leaveRoom,
  setPlayerStatus,
  Room, 
  RoomPlayer, 
  RoomStatus, 
  PlayerStatus 
} from '../services/MultiplayerService';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDocs, collection } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { Difficulty } from '../game/types';

interface MultiplayerMenuProps {
  onGameStart: (config: { roomId: string; seed: number; duration: number; difficulty: Difficulty }) => void;
  onClose: () => void;
  activeMatch?: { roomId: string; score: number };
}

export const MultiplayerMenu: React.FC<MultiplayerMenuProps> = ({ onGameStart, onClose, activeMatch }) => {
  const { user, profile } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinId, setJoinId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [duration, setDuration] = useState(180); // 3 mins default

  useEffect(() => {
    if (roomId) {
      const unsubRoom = subscribeToRoom(roomId, (updatedRoom) => {
        setRoom(updatedRoom);
        if (updatedRoom.status === RoomStatus.PLAYING && updatedRoom.startTime) {
           onGameStart({
             roomId: updatedRoom.id,
             seed: updatedRoom.seed,
             duration: updatedRoom.duration,
             difficulty: updatedRoom.difficulty
           });
        }
      });
      const unsubPlayers = subscribeToPlayers(roomId, setPlayers);
      return () => {
        unsubRoom();
        unsubPlayers();
      };
    }
  }, [roomId, onGameStart]);

  const handleCreate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const id = await createRoom(user.uid, profile?.displayName || user.displayName || 'Anonymous', profile?.photoURL, difficulty, duration);
      setRoomId(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !joinId) return;
    setLoading(true);
    setError(null);
    try {
      await joinRoom(joinId.toUpperCase(), user.uid, profile?.displayName || user.displayName || 'Anonymous', profile?.photoURL);
      setRoomId(joinId.toUpperCase());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!user || !roomId) return;
    await leaveRoom(roomId, user.uid);
    setRoomId(null);
    setRoom(null);
    setPlayers([]);
  };

  const copyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!roomId) {
    return (
      <div className="max-w-md mx-auto pt-10">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-7xl font-black italic uppercase tracking-tighter leading-none text-lime-400">Battle</h2>
            <h3 className="text-neutral-500 font-mono tracking-[0.3em] uppercase text-[10px] mt-4">Real-Time Synchronization Logic</h3>
          </div>
          <button onClick={onClose} className="px-8 py-3 bg-white text-black font-black uppercase text-xs hover:bg-rose-500 hover:text-white transition-all transform hover:-translate-y-1">
            Abort
          </button>
        </div>

        <div className="space-y-8">
          <div className="bg-neutral-900 p-8 border-l-4 border-blue-500">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-6">Initialize New Sector</h4>
            <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="space-y-2">
                 <p className="text-[10px] font-bold text-neutral-600 uppercase">System Intensity</p>
                 <select 
                   value={difficulty} 
                   onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                   className="w-full bg-black border border-neutral-800 text-white p-3 font-bold uppercase text-[10px]"
                 >
                   <option value="easy">Easy (3x3)</option>
                   <option value="medium">Medium (4x4)</option>
                   <option value="hard">Hard (5x5)</option>
                 </select>
               </div>
               <div className="space-y-2">
                 <p className="text-[10px] font-bold text-neutral-600 uppercase">Interval Duration</p>
                 <select 
                   value={duration} 
                   onChange={(e) => setDuration(parseInt(e.target.value))}
                   className="w-full bg-black border border-neutral-800 text-white p-3 font-bold uppercase text-[10px]"
                 >
                   <option value={180}>180 Seconds (3m)</option>
                   <option value={300}>300 Seconds (5m)</option>
                 </select>
               </div>
            </div>
            <button 
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all flex items-center justify-center gap-3"
            >
              <Users className="w-4 h-4" />
              Manifest Room
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase font-black"><span className="bg-neutral-950 px-4 text-neutral-600 tracking-widest">OR</span></div>
          </div>

          <div className="bg-neutral-900 p-8 border-l-4 border-lime-400">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-6">Link to Existing Node</h4>
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="SECTOR CODE"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                className="flex-1 bg-black border border-neutral-800 text-white p-4 font-black uppercase tracking-widest text-center"
              />
              <button 
                onClick={handleJoin}
                disabled={loading || !joinId}
                className="px-8 bg-lime-400 text-black font-black uppercase tracking-tighter hover:bg-white transition-all disabled:opacity-50"
              >
                Sync
              </button>
            </div>
            {error && <p className="text-rose-500 text-[10px] font-bold uppercase mt-4 animate-pulse">! Error: {error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pt-10 pb-20">
      <div className="flex justify-between items-end mb-12">
        <div>
          <div className="flex items-center gap-3 mb-4">
             <span className="bg-blue-600 text-white px-3 py-1 font-black text-[10px] uppercase tracking-widest">Active Link</span>
             <button onClick={copyRoomId} className="flex items-center gap-2 text-lime-400 text-[10px] font-bold uppercase hover:text-white transition-colors">
               {roomId} {copied ? <Check className="w-3 h-3" /> : <Copy className="w-4 h-4" />}
             </button>
          </div>
          <h2 className="text-6xl font-black italic uppercase tracking-tighter leading-none text-white">Lobby</h2>
        </div>
        <button onClick={handleLeave} className="px-6 py-2 border-2 border-rose-500 text-rose-500 font-black uppercase text-[10px] hover:bg-rose-500 hover:text-white transition-all">
          Departure
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-neutral-900 border-l-4 border-lime-400 p-6 flex justify-between items-center">
           <div className="flex items-center gap-4">
              <Shield className="w-8 h-8 text-lime-400" />
              <div>
                <p className="text-[10px] font-black uppercase text-neutral-500">System Parameters</p>
                <p className="text-xl font-black uppercase italic italic">{room?.difficulty} MODE // {room?.duration}s</p>
              </div>
           </div>
           {room?.hostId === user?.uid && (
              room.status === RoomStatus.WAITING ? (
                <button 
                  onClick={() => startRoomGame(roomId)}
                  className="bg-lime-400 text-black px-6 py-3 font-black uppercase text-xs flex items-center gap-2 hover:bg-white transition-all"
                >
                  <Play className="w-4 h-4" /> Start
                </button>
              ) : room.status === RoomStatus.FINISHED ? (
                <button 
                  onClick={async () => {
                    const roomRef = doc(db, 'multiplayerRooms', roomId);
                    await updateDoc(roomRef, { 
                      status: RoomStatus.WAITING,
                      seed: Math.floor(Math.random() * 1000000)
                    });
                    // Reset all player scores
                    const playersSnap = await getDocs(collection(db, 'multiplayerRooms', roomId, 'players'));
                    const batch: any[] = [];
                    playersSnap.docs.forEach(d => {
                      batch.push(updateDoc(doc(db, 'multiplayerRooms', roomId, 'players', d.id), {
                        score: 0,
                        status: PlayerStatus.READY
                      }));
                    });
                    await Promise.all(batch);
                  }}
                  className="bg-blue-600 text-white px-6 py-3 font-black uppercase text-xs hover:bg-white hover:text-black transition-all"
                >
                  Restart Matrix
                </button>
              ) : null
           )}
        </div>

        <div className="bg-neutral-900/50 p-1">
           <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Connected Operators</span>
           </div>
           <div className="divide-y divide-neutral-900">
              {players.map((p) => (
                <div key={p.userId} className="flex items-center justify-between p-4 hover:bg-neutral-900 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-neutral-800 overflow-hidden border border-neutral-700">
                        {p.photoURL ? <img src={p.photoURL} alt="" /> : <div className="w-full h-full flex items-center justify-center font-black text-neutral-600">{p.displayName[0]}</div>}
                      </div>
                      <div>
                        <p className="font-black uppercase text-xs tracking-tight italic">
                          {p.displayName} {p.userId === room?.hostId && <span className="text-[10px] text-blue-500 ml-1">HOST</span>}
                        </p>
                        <p className={`text-[10px] font-bold uppercase ${p.status === PlayerStatus.READY ? 'text-lime-400' : 'text-amber-400'}`}>
                          {p.status}
                        </p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black uppercase text-neutral-500">Score</p>
                      <p className="text-xl font-black text-white italic">{p.score.toLocaleString()}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>

      <div className="mt-12 p-6 border-2 border-dashed border-neutral-800 text-center">
         <p className="text-[10px] font-mono text-neutral-600 uppercase leading-relaxed tracking-wider">
           &gt; NO POWERUPS AVAILABLE IN BATTLE MODE.<br/>
           &gt; ALL OPERATORS SYNCED TO SEED_{room?.seed}.<br/>
           &gt; WAIT FOR HOST TO INITIATE SEQUENCE.
         </p>
      </div>
    </div>
  );
};
