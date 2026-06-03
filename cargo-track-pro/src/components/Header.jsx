import { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wifi, WifiOff } from 'lucide-react';
import { AppContext } from '../App';

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/map':       'Live Map',
  '/shelves':   'Shelf Management',
  '/camera':    'Camera Monitor',
  '/analytics': 'Analytics',
};

export default function Header() {
  const location          = useLocation();
  const { connected }     = useContext(AppContext);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h   = String(now.getHours()).padStart(2, '0');
      const m   = String(now.getMinutes()).padStart(2, '0');
      const s   = String(now.getSeconds()).padStart(2, '0');
      setClock(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const title = PAGE_TITLES[location.pathname] ?? 'CargoTrack Pro';

  return (
    <header className="fixed top-0 left-60 right-0 h-16 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 flex items-center justify-between px-6 z-40 shadow-lg">
      {/* Left: page title */}
      <h1 className="text-white font-semibold text-lg">{title}</h1>

      {/* Centre: live clock */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <span className="font-mono text-lg font-bold text-blue-400 tracking-widest">
          {clock}
        </span>
      </div>

      {/* Right: connection indicator */}
      <div className="flex items-center gap-2">
        {connected ? (
          <>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 glow-green" />
            <span className="text-xs text-emerald-400 font-medium hidden sm:block">Connected</span>
            <Wifi size={14} className="text-emerald-400" />
          </>
        ) : (
          <>
            <div className="w-2.5 h-2.5 rounded-full bg-red-400 pulse-ring" />
            <span className="text-xs text-red-400 font-medium hidden sm:block">Offline</span>
            <WifiOff size={14} className="text-red-400" />
          </>
        )}
      </div>
    </header>
  );
}