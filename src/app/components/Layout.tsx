import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Activity, Check, History, Languages, LogOut, Scan, Shield } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Toaster } from './ui/sonner';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { VoiceCommandListener } from './VoiceCommandListener';
import { FloatingScanProgress } from './FloatingScanProgress';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { t, language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navigation = [
    { name: t('dashboard'), path: '/', icon: Activity },
    { name: t('scanner'), path: '/scanner', icon: Scan },
    { name: t('scanHistory'), path: '/history', icon: History },
  ].filter((item) => user?.role === 'admin' || item.path === '/');

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">VA Scanner</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {user && (
                <div className="rounded-md border px-3 py-1.5 text-sm">
                  <span className="font-medium">{user.displayName}</span>
                  <span className="ml-2 text-muted-foreground">{user.role}</span>
                </div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Languages className="h-4 w-4" />
                    {language === 'th' ? 'TH' : 'EN'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setLanguage('th')}>
                    <div className="flex w-full items-center justify-between">
                      <span>Thai</span>
                      {language === 'th' && <Check className="ml-2 h-4 w-4" />}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLanguage('en')}>
                    <div className="flex w-full items-center justify-between">
                      <span>English</span>
                      {language === 'en' && <Check className="ml-2 h-4 w-4" />}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {user && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b bg-card">
        <div className="container mx-auto px-6">
          <div className="flex gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
                    active
                      ? 'border-primary text-primary font-medium'
                      : 'border-transparent text-muted-foreground hover:border-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="min-h-[calc(100vh-140px)]">{children}</main>

      <footer className="mt-12 border-t bg-card">
        <div className="container mx-auto px-6 py-4 text-center text-sm text-muted-foreground">
          {t('footer_text')}
        </div>
      </footer>

      <VoiceCommandListener />
      <FloatingScanProgress />
      <Toaster />
    </div>
  );
}
