import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type UserRole = 'admin' | 'user';

export interface MockUser {
  username: string;
  displayName: string;
  role: UserRole;
}

interface AuthContextType {
  user: MockUser | null;
  login: (username: string) => boolean;
  logout: () => void;
  canAccessRoute: (path: string) => boolean;
}

const mockUsers: MockUser[] = [
  { username: 'admin', displayName: 'Admin', role: 'admin' },
  { username: 'user', displayName: 'User', role: 'user' },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitialUser() {
  try {
    const username = localStorage.getItem('network_scanner_mock_user');
    return mockUsers.find((item) => item.username === username) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(getInitialUser);

  const value = useMemo<AuthContextType>(() => ({
    user,
    login: (username: string) => {
      const nextUser = mockUsers.find((item) => item.username === username);
      if (!nextUser) return false;
      setUser(nextUser);
      localStorage.setItem('network_scanner_mock_user', nextUser.username);
      return true;
    },
    logout: () => {
      setUser(null);
      localStorage.removeItem('network_scanner_mock_user');
    },
    canAccessRoute: (path: string) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return path === '/' || path === '/login';
    },
  }), [user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
