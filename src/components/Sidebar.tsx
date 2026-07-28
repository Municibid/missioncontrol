'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Calendar, 
  FolderKanban, 
  Brain, 
  FileText, 
  Users,
  Timer,
  Cpu,
  LogOut
} from 'lucide-react';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cron Jobs', href: '/cron', icon: Timer },
  { name: 'Models & Spend', href: '/models', icon: Cpu },
  { name: 'Task Board', href: '/tasks', icon: CheckSquare },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Projects', href: '/projects', icon: FolderKanban },
  { name: 'Memory', href: '/memory', icon: Brain },
  { name: 'Documents', href: '/documents', icon: FileText },
  { name: 'Team', href: '/team', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#0c0c0f] border-r border-[#1f1f23] flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[#1f1f23]">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-[#0c0c0f]" title="Marty">
              M
            </div>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-400 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-[#0c0c0f]" title="MARA">
              A
            </div>
          </div>
          <div>
            <h1 className="font-semibold text-white leading-tight">Mission Control</h1>
            <p className="text-[11px] text-zinc-500">Marty &amp; MARA</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-zinc-400 hover:bg-[#1f1f23] hover:text-white'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="px-4 py-4 border-t border-[#1f1f23]">
        {session?.user ? (
          <div className="flex items-center gap-3">
            <div className="relative">
              {session.user.image ? (
                <img 
                  src={session.user.image} 
                  alt={session.user.name || ''} 
                  className="w-9 h-9 rounded-full"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                  {session.user.name?.[0] || session.user.email?.[0] || '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {session.user.name || session.user.email}
              </p>
              <p className="text-xs text-zinc-500 truncate">{session.user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="p-2 text-zinc-400 hover:text-white hover:bg-[#1f1f23] rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-800 animate-pulse" />
            <div className="flex-1">
              <div className="h-4 bg-zinc-800 rounded animate-pulse mb-1" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse w-2/3" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
