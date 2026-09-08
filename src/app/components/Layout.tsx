import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Activity, Bell, Check, ChevronLeft, ChevronRight, History, Languages, LogOut, Menu, Scan, Settings as SettingsIcon, Shield, Wifi } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Toaster } from './ui/sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { VoiceCommandListener } from './VoiceCommandListener';
import { FloatingScanProgress } from './FloatingScanProgress';

interface LayoutProps { children: ReactNode }

export function Layout({ children }: LayoutProps) {
  const { t, language, setLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = [
    { name: t('dashboard'), path: '/', icon: Activity },
    { name: t('scanner'), path: '/scanner', icon: Scan },
    { name: t('scanHistory'), path: '/history', icon: History },
    { name: t('settings'), path: '/settings', icon: SettingsIcon },
  ].filter((item) => user?.role === 'admin' || item.path === '/');
  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="min-h-screen bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Shield className="size-5" /></div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight">Tawan VA Scan</p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Security console</p></div>}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary navigation">
          <p className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground ${collapsed ? 'sr-only' : ''}`}>Workspace</p>
          {navigation.map((item) => { const Icon = item.icon; const active = isActive(item.path); return <Link key={item.path} to={item.path} title={collapsed ? item.name : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${active ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'} ${collapsed ? 'justify-center' : ''}`}><Icon className="size-[18px] shrink-0" />{!collapsed && <span>{item.name}</span>}</Link> })}
          <div className="mt-auto border-t border-sidebar-border pt-3"><div className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs text-muted-foreground ${collapsed ? 'justify-center' : ''}`}><span className="size-2 rounded-full bg-low" />{!collapsed && <span>Agent connected</span>}</div></div>
        </nav>
        <button onClick={() => setCollapsed(!collapsed)} className="m-3 flex items-center justify-center rounded-md border border-sidebar-border p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-background/80 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Shield className="size-5" /></div><span className="text-sm font-bold">Tawan VA Scan</span></div><Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}><ChevronLeft className="size-5" /></Button></div>
        <nav className="flex flex-col gap-1 p-3">{navigation.map((item) => { const Icon = item.icon; return <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm ${isActive(item.path) ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground'}`}><Icon className="size-[18px]" />{item.name}</Link> })}</nav>
      </aside>

      <div className={`min-h-screen transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></Button>
          <div className="relative hidden max-w-sm flex-1 md:block"><Wifi className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="h-9 border-border bg-input-background pl-9 text-xs" placeholder={language === 'th' ? 'ค้นหาอุปกรณ์, IP หรือ CVE...' : 'Search assets, IPs or CVEs...'} /></div>
          <div className="ml-auto flex items-center gap-2"><div className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-low" />Live</div><Button variant="ghost" size="icon" aria-label="Notifications"><Bell className="size-4" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-2"><Languages className="size-4" />{language === 'th' ? 'TH' : 'EN'}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setLanguage('th')}><span>ไทย</span>{language === 'th' && <Check className="ml-auto size-4" />}</DropdownMenuItem><DropdownMenuItem onClick={() => setLanguage('en')}><span>English</span>{language === 'en' && <Check className="ml-auto size-4" />}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>{user && <Button variant="ghost" size="sm" className="hidden gap-2 sm:flex" onClick={handleLogout}><span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{user.displayName.charAt(0)}</span><span className="max-w-24 truncate text-xs">{user.displayName}</span><LogOut className="size-3.5 text-muted-foreground" /></Button>}</div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
      <VoiceCommandListener /><FloatingScanProgress /><Toaster />
    </div>
  );
}
