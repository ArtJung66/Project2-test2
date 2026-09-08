import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Scanner } from './pages/Scanner';
import { ScanHistory } from './pages/ScanHistory';
import { Settings } from './pages/Settings';
import { DeviceDetail } from './pages/DeviceDetail';
import { Login } from './pages/Login';
import { useAuth } from './contexts/AuthContext';
import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, canAccessRoute } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!canAccessRoute(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function Root() {
  return <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>;
}

function ScannerPage() {
  return <ProtectedRoute><Layout><Scanner /></Layout></ProtectedRoute>;
}

function HistoryPage() {
  return <ProtectedRoute><Layout><ScanHistory /></Layout></ProtectedRoute>;
}

function SettingsPage() {
  return <ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>;
}

function DeviceDetailPage() {
  return <ProtectedRoute><Layout><DeviceDetail /></Layout></ProtectedRoute>;
}

function LoginPage() {
  return <Login />;
}

// ==========================================
// ROUTES CONFIGURATION (ส่วนการตั้งค่าเส้นทางของแต่ละหน้าในเว็บไซต์)
// ==========================================
export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: Root,
  },
  {
    path: '/scanner',
    Component: ScannerPage,
  },
  {
    path: '/history',
    Component: HistoryPage,
  },
  {
    path: '/settings',
    Component: SettingsPage,
  },
  {
    path: '/device',
    Component: DeviceDetailPage,
  },
]);
