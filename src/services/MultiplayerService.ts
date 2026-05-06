import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  getDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Difficulty } from '../game/types';

export enum RoomStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished'
}

export enum PlayerStatus {
  READY = 'ready',
  PLAYING = 'playing',
  FINISHED = 'finished'
}

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  difficulty: Difficulty;
  duration: number; // in seconds
  seed: number;
  createdAt: any;
  startTime?: any;
  endTime?: any;
}

export interface RoomPlayer {
  userId: string;
  displayName: string;
  score: number;
  status: PlayerStatus;
  lastUpdate: any;
  photoURL?: string;
}

export const createRoom = async (hostId: string, displayName: string, photoURL: string | undefined, difficulty: Difficulty, duration: number) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  const seed = Math.floor(Math.random() * 1000000);

  const roomData: Partial<Room> = {
    id: roomId,
    hostId,
    status: RoomStatus.WAITING,
    difficulty,
    duration,
    seed,
    createdAt: serverTimestamp()
  };

  await setDoc(roomRef, roomData);

  const playerRef = doc(db, 'multiplayerRooms', roomId, 'players', hostId);
  const playerData: RoomPlayer = {
    userId: hostId,
    displayName,
    photoURL,
    score: 0,
    status: PlayerStatus.READY,
    lastUpdate: serverTimestamp()
  };

  await setDoc(playerRef, playerData);
  return roomId;
};

export const joinRoom = async (roomId: string, userId: string, displayName: string, photoURL: string | undefined) => {
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    throw new Error('Room not found');
  }

  const roomData = roomSnap.data() as Room;
  if (roomData.status !== RoomStatus.WAITING) {
    throw new Error('Game already in progress or finished');
  }

  const playerRef = doc(db, 'multiplayerRooms', roomId, 'players', userId);
  const playerData: RoomPlayer = {
    userId,
    displayName,
    photoURL,
    score: 0,
    status: PlayerStatus.READY,
    lastUpdate: serverTimestamp()
  };

  await setDoc(playerRef, playerData);
};

export const startRoomGame = async (roomId: string) => {
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  await updateDoc(roomRef, {
    status: RoomStatus.PLAYING,
    startTime: serverTimestamp()
  });
};

export const updatePlayerScore = async (roomId: string, userId: string, score: number) => {
  const playerRef = doc(db, 'multiplayerRooms', roomId, 'players', userId);
  await updateDoc(playerRef, {
    score,
    lastUpdate: serverTimestamp()
  });
};

export const setPlayerStatus = async (roomId: string, userId: string, status: PlayerStatus) => {
  const playerRef = doc(db, 'multiplayerRooms', roomId, 'players', userId);
  await updateDoc(playerRef, {
    status,
    lastUpdate: serverTimestamp()
  });
};

export const subscribeToRoom = (roomId: string, callback: (room: Room) => void) => {
  return onSnapshot(doc(db, 'multiplayerRooms', roomId), (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() } as Room);
    }
  });
};

export const subscribeToPlayers = (roomId: string, callback: (players: RoomPlayer[]) => void) => {
  return onSnapshot(collection(db, 'multiplayerRooms', roomId, 'players'), (snapshot) => {
    const players = snapshot.docs.map(doc => doc.data() as RoomPlayer);
    callback(players);
  });
};

export const leaveRoom = async (roomId: string, userId: string) => {
  const playerRef = doc(db, 'multiplayerRooms', roomId, 'players', userId);
  await deleteDoc(playerRef);

  // If host leaves, maybe close the room?
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  const roomSnap = await getDoc(roomRef);
  if (roomSnap.exists() && roomSnap.data().hostId === userId) {
     // Optional: Mark room as finished or transfer host
     await updateDoc(roomRef, { status: RoomStatus.FINISHED });
  }
};
