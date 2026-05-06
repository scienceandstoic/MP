import { 
  setDoc, 
  doc, 
  updateDoc, 
  increment, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error(`Firestore Error [${operationType}] on ${path}:`, error);
  throw error;
}

export const saveScore = async (userId: string, displayName: string, score: number, difficulty: string) => {
  const path = `leaderboards/${difficulty}/entries/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const highScores = userData.highScores || {};
    const previousBest = highScores[difficulty] || 0;

    if (score > previousBest) {
      // Update the per-difficulty personal best in user profile
      const newHighScores = { ...highScores, [difficulty]: score };
      
      // Also update the global aggregate highscore if this is higher than total best
      const globalBest = userData.highScore || 0;
      const updateData: any = { highScores: newHighScores };
      if (score > globalBest) {
        updateData.highScore = score;
      }
      
      await updateDoc(userRef, updateData);

      // Record in the appropriate leaderboard
      await setDoc(doc(db, 'leaderboards', difficulty, 'entries', userId), {
        userId,
        displayName,
        score,
        difficulty,
        timestamp: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const updateUserXP = async (userId: string, xpGain: number) => {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      xp: increment(xpGain),
      totalScore: increment(xpGain)
    });
    
    // Simple level logic: Level = TotalScore / 10000 approx
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const data = userDoc.data();
      const newLevel = Math.floor((data.totalScore || 0) / 5000) + 1;
      if (newLevel > (data.level || 1)) {
        await updateDoc(userRef, { level: newLevel });
        return true; // Leveled up
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  return false;
};

export const getLeaderboard = async (difficulty: string = 'medium') => {
  const path = `leaderboards/${difficulty}/entries`;
  try {
    const q = query(
      collection(db, 'leaderboards', difficulty, 'entries'),
      orderBy('score', 'desc'),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const syncUser = async (user: any) => {
  if (!user) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const userSnap = await getDoc(userRef);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        userId: user.uid,
        displayName: user.displayName || 'Pulse Runner',
        photoURL: user.photoURL,
        highScore: 0,
        totalScore: 0,
        level: 1,
        xp: 0,
        gold: 100, // Initial gold
        highScores: {}, // Per-difficulty high scores
        totalGames: 0,
        totalScoreSum: 0,
        maxCombo: 0,
        lastLogin: now.toISOString(),
        loginStreak: 1,
        unlockedPowerups: ['zap']
      });
      return { streak: 1, reward: 100 };
    } else {
      const data = userSnap.data();
      const lastLogin = new Date(data.lastLogin);
      const lastLoginStr = lastLogin.toISOString().split('T')[0];

      if (todayStr === lastLoginStr) {
        return { streak: data.loginStreak, reward: 0 };
      }

      // Check if it's the next day
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let newStreak = 1;
      if (lastLoginStr === yesterdayStr) {
        newStreak = (data.loginStreak || 0) + 1;
      }

      const reward = newStreak * 50; // 50 gold per streak day
      await updateDoc(userRef, {
        lastLogin: now.toISOString(),
        loginStreak: newStreak,
        gold: increment(reward)
      });

      return { streak: newStreak, reward };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    return null;
  }
};

export const updateGameStats = async (userId: string, gameScore: number, gameCombo: number) => {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return;

    const data = userDoc.data();
    const currentMaxCombo = data.maxCombo || 0;

    await updateDoc(userRef, {
      totalGames: increment(1),
      totalScoreSum: increment(gameScore),
      maxCombo: gameCombo > currentMaxCombo ? gameCombo : currentMaxCombo
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const addGold = async (userId: string, amount: number) => {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      gold: increment(amount)
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
};

export const deductGold = async (userId: string, amount: number) => {
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      gold: increment(-amount)
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
};
