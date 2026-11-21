import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { syncUserProfileToFirestore } from '../services/firestoreSync';
import type { AuthSession, UserRole } from '../types';

const SESSION_KEY = 'synapse_auth_session_v1';

export interface DemoAccountDescriptor {
  id: string;
  role: UserRole;
  email: string;
  passwordHint: string;
  displayName: string;
  assignedStoreId?: string;
  storeLabel?: string;
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccountDescriptor[] = [
  {
    id: 'demo-customer-1',
    role: 'CUSTOMER',
    email: 'customer@synapse.demo',
    passwordHint: 'synapse-customer-2026',
    displayName: 'Aarav Sharma',
    description: 'Shopper in Indiranagar, Bengaluru. Browse catalog, test Trade-off Slider, Product Rescue, and checkout.',
  },
  {
    id: 'demo-manager-indiranagar',
    role: 'STORE_MANAGER',
    email: 'manager.indiranagar@synapse.demo',
    passwordHint: 'synapse-manager-2026',
    displayName: 'Rohan Kulkarni',
    assignedStoreId: 'indiranagar',
    storeLabel: 'SYNAPSE Indiranagar',
    description: 'Store Manager scoped exclusively to SYNAPSE Indiranagar. Verify physical stock & fulfil pick tasks.',
  },
  {
    id: 'demo-manager-whitefield',
    role: 'STORE_MANAGER',
    email: 'manager.whitefield@synapse.demo',
    passwordHint: 'synapse-manager-2026',
    displayName: 'Karthik Rao',
    assignedStoreId: 'whitefield',
    storeLabel: 'SYNAPSE Whitefield',
    description: 'Store Manager scoped exclusively to SYNAPSE Whitefield. Manage ITPL surplus, pick tasks & transfers.',
  },
  {
    id: 'demo-manager-koramangala',
    role: 'STORE_MANAGER',
    email: 'manager.koramangala@synapse.demo',
    passwordHint: 'synapse-manager-2026',
    displayName: 'Ananya Deshmukh',
    assignedStoreId: 'koramangala',
    storeLabel: 'SYNAPSE Koramangala',
    description: 'Store Manager scoped exclusively to SYNAPSE Koramangala. Verify 4th Block stock & fulfil local orders.',
  },
  {
    id: 'demo-manager-jayanagar',
    role: 'STORE_MANAGER',
    email: 'manager.jayanagar@synapse.demo',
    passwordHint: 'synapse-manager-2026',
    displayName: 'Meera Nair',
    assignedStoreId: 'jayanagar',
    storeLabel: 'SYNAPSE Jayanagar',
    description: 'Store Manager scoped exclusively to SYNAPSE Jayanagar. Handle pick verification & stock requests.',
  },
  {
    id: 'demo-admin-1',
    role: 'NETWORK_ADMIN',
    email: 'admin@synapse.demo',
    passwordHint: 'synapse-admin-2026',
    displayName: 'Priya Menon',
    description: 'Network Administrator overseeing all 4 Bengaluru stores, Demand Radar, and Surplus Exchange.',
  },
];

interface AuthContextValue {
  session: AuthSession | null;
  authReady: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithGoogle: () => Promise<AuthSession | null>;
  loginWithDemoAccount: (roleOrAccountId: string) => AuthSession;
  loginWithCredentials: (email: string, password: string) => AuthSession | null;
  registerCustomer: (input: {
    displayName: string;
    email: string;
    city: string;
    preferredStoreId: string;
  }) => AuthSession;
  updateProfile: (patch: Partial<Pick<AuthSession, 'displayName' | 'city' | 'preferredStoreId'>>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const stored = readStoredSession();
        const isBootstrappedAdmin = firebaseUser.email === 'nishchalas.official@gmail.com';
        const nextSession: AuthSession = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || 'user@synapse.demo',
          displayName: stored?.uid === firebaseUser.uid ? stored.displayName : firebaseUser.displayName || 'SYNAPSE User',
          role: isBootstrappedAdmin ? 'NETWORK_ADMIN' : stored?.uid === firebaseUser.uid ? stored.role : 'CUSTOMER',
          assignedStoreId: stored?.assignedStoreId,
          city: stored?.city || 'Bengaluru',
          preferredStoreId: stored?.preferredStoreId || 'indiranagar',
          authMode: 'FIREBASE_GOOGLE',
          emailVerified: firebaseUser.emailVerified,
        };
        setSession(nextSession);
        writeStoredSession(nextSession);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async (): Promise<AuthSession | null> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const isBootstrappedAdmin = user.email === 'nishchalas.official@gmail.com';
      const newSession: AuthSession = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'SYNAPSE Shopper',
        role: isBootstrappedAdmin ? 'NETWORK_ADMIN' : 'CUSTOMER',
        city: 'Bengaluru',
        preferredStoreId: 'indiranagar',
        authMode: 'FIREBASE_GOOGLE',
        emailVerified: user.emailVerified,
      };
      setSession(newSession);
      writeStoredSession(newSession);
      void syncUserProfileToFirestore(newSession).catch((err) => {
        console.warn('Profile sync skipped or deferred:', err);
      });
      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Sign-In failed. Please try again.';
      setAuthError(message);
      return null;
    }
  };

  const loginWithDemoAccount = (roleOrAccountId: string): AuthSession => {
    setAuthError(null);
    const account =
      DEMO_ACCOUNTS.find((a) => a.id === roleOrAccountId) ||
      DEMO_ACCOUNTS.find((a) => a.role === roleOrAccountId) ||
      DEMO_ACCOUNTS[0];
    const demoSession: AuthSession = {
      uid: account.id,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      assignedStoreId: account.assignedStoreId,
      city: 'Bengaluru',
      preferredStoreId: account.assignedStoreId || 'indiranagar',
      authMode: 'DEMO_LOCAL',
      emailVerified: true,
    };
    setSession(demoSession);
    writeStoredSession(demoSession);
    return demoSession;
  };

  const loginWithCredentials = (email: string, password: string): AuthSession | null => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const matched = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!matched || password.trim() !== matched.passwordHint) {
      setAuthError('Invalid demo email or password. Use one of the documented demo credentials below.');
      return null;
    }
    return loginWithDemoAccount(matched.id);
  };

  const registerCustomer = (input: {
    displayName: string;
    email: string;
    city: string;
    preferredStoreId: string;
  }): AuthSession => {
    setAuthError(null);
    const uid = `demo-cust-${Date.now()}`;
    const newSession: AuthSession = {
      uid,
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      role: 'CUSTOMER',
      city: input.city.trim() || 'Bengaluru',
      preferredStoreId: input.preferredStoreId || 'indiranagar',
      authMode: 'DEMO_LOCAL',
      emailVerified: true,
    };
    setSession(newSession);
    writeStoredSession(newSession);
    return newSession;
  };

  const updateProfile = (patch: Partial<Pick<AuthSession, 'displayName' | 'city' | 'preferredStoreId'>>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      writeStoredSession(updated);
      if (updated.authMode === 'FIREBASE_GOOGLE') {
        void syncUserProfileToFirestore(updated).catch(() => undefined);
      }
      return updated;
    });
  };

  const logout = async (): Promise<void> => {
    setAuthError(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setSession(null);
    writeStoredSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        authReady,
        authError,
        clearAuthError: () => setAuthError(null),
        loginWithGoogle,
        loginWithDemoAccount,
        loginWithCredentials,
        registerCustomer,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
