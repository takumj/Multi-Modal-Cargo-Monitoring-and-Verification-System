import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, Package, Camera, BarChart2,
  Truck, Navigation, Target, MapPin, History, ChevronDown, ChevronUp,
} from 'lucide-react';

const MAP_SECTIONS = [
  { key: 'gps',      label: 'GPS',      Icon: Navigation, color: 'text-blue-400',    bg: 'bg-blue-500/10'   },
  { key: 'geofence', label: 'Geofence', Icon: Target,     color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  { key: 'route',    label: 'Route',    Icon: MapPin,     color: 'text-emerald-400', bg: 'bg-emerald-500/10'},
  { key: 'history',  label: 'History',  Icon: History,    color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
];

const OTHER_NAV = [
  { to: '/shelves',   label: 'Shelves',   icon: Package   },
  { to: '/camera',    label: 'Camera',    icon: Camera    },
  { to: '/analytics', label: 'Analytics', icon: BarChart2 },
];

export default function Sidebar() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const onMap     = location.pathname === '/map';

  // Keep Live Map expanded whenever we're on /map
  const [mapOpen, setMapOpen] = useState(onMap);

  // Which sub-item is active (read from URL search params)
  const params       = new URLSearchParams(location.search);
  const activePanel  = params.get('panel');

  function handleMapClick() {
    if (!onMap) {
      navigate('/map');
      setMapOpen(true);
    } else {
      setMapOpen(o => !o);
    }
  }

  function handleSubItem(key) {
    const current = new URLSearchParams(location.search).get('panel');
    if (current === key) {
      navigate('/map');            // close panel
    } else {
      navigate(`/map?panel=${key}`); // open panel
    }
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-900 border-r border-slate-700/60 flex flex-col z-50 shadow-2xl">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/60">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
          <Truck size={20} className="text-white"/>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">CargoTrack</p>
          <p className="text-blue-400 font-bold text-sm leading-tight">Pro</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        {/* Dashboard */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
              isActive
                ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400 pl-2.5'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard size={18} className={isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}/>
              Dashboard
            </>
          )}
        </NavLink>

        {/* Live Map — expandable */}
        <div>
          <button
            onClick={handleMapClick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
              onMap
                ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400 pl-2.5'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Map size={18} className={onMap ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}/>
            <span className="flex-1 text-left">Live Map</span>
            {mapOpen
              ? <ChevronUp  size={14} className="text-slate-500 flex-shrink-0"/>
              : <ChevronDown size={14} className="text-slate-500 flex-shrink-0"/>
            }
          </button>

          {/* Sub-items */}
          {mapOpen && (
            <div className="mt-1 ml-4 space-y-0.5 border-l border-slate-700/60 pl-3">
              {MAP_SECTIONS.map(({ key, label, Icon, color, bg }) => {
                const isActive = onMap && activePanel === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSubItem(key)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? `${bg} ${color}`
                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                  >
                    <Icon size={13} className={isActive ? color : 'text-slate-600'}/>
                    {label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current flex-shrink-0"/>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Other nav items */}
        {OTHER_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400 pl-2.5'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}/>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-700/60">
        <p className="text-slate-400 text-xs font-medium">Takudzwa Tivavone</p>
        <p className="text-slate-500 text-xs">Final Year Project</p>
        <p className="text-slate-600 text-xs mt-1">© 2026</p>
      </div>
    </aside>
  );
}