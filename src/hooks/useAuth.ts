import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, loginWithGoogle } from '../lib/firebase';
import { syncUser } from '../lib/db';

export interface UserProfile {
  userId: string;
  displayName: string;
  highScore: number;
  totalScore: number;
  level: number;
  xp: number;
  gold: number;
  loginStreak: number;
  unlockedPowerups: string[];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        await syncUser(u);
        setUser(u);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      }
      setLoading(false);
    });

    return unsubscribeProfile;
  }, [user]);

  const login = async () => {
    try {
      const u = await loginWithGoogle();
      return u;
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = () => auth.signOut();

  return { user, profile, loading, login, logout };
}
