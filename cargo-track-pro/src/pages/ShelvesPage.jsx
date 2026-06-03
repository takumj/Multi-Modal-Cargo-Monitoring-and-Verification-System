import { useContext, useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Package, PackageOpen, Activity, Clock,
  DoorOpen, DoorClosed, Zap, ShieldAlert,
} from 'lucide-react';
import { AppContext } from '../App';
import { format } from 'date-fns';

// ─── Helper: normalise reed switch field ──────────────────────────────────────
function isContainerOpen(shelf) {
  if (!shelf) return false;
  if (typeof shelf.container_open === 'boolean') return shelf.container_open;
  if (shelf.reed_switch !== undefined) return shelf.reed_switch !== 'CLOSED';
  return false;
}

// ─── Per-shelf history hook ───────────────────────────────────────────────────
function useShelfHistory(shelfData) {
  const [events,     setEvents] = useState([]);
  const [vibHistory, setVibH]   = useState([]);
  const [occupancy,  setOcc]    = useState([]);
  const prevRef         = useRef(null);
  const sessionStart    = useRef(Date.now());
  const initializedRef  = useRef(false);

  // ── Sample occupancy every 5 s regardless of changes ─────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!shelfData) return;
      const elapsed = (Date.now() - sessionStart.current) / 1000;
      setOcc(o => [...o, { t: elapsed, occupied: shelfData.parcel_present ?? false }].slice(-120));
    }, 5000);
    return () => clearInterval(id);
  }, [shelfData]);

  // ── Detect changes and record initial state ───────────────────────────────
  useEffect(() => {
    if (!shelfData) return;

    // First data arrival — record initial state as first event
    if (!initializedRef.current) {
      initializedRef.current = true;
      const ts      = new Date();
      const occupied = shelfData.parcel_present ?? false;
      setEvents([{
        id: Date.now(), ts,
        event:    `Session started — Shelf ${occupied ? 'OCCUPIED' : 'EMPTY'}`,
        duration: '—',
        severity: occupied ? 'success' : 'info',
      }]);
      // Seed first occupancy sample
      setOcc([{ t: 0, occupied }]);
      prevRef.current = shelfData;
      return;
    }

    const prev = prevRef.current;
    prevRef.current = shelfData;
    if (!prev) return;

    const ts = new Date();
    const addEvent = (event, duration, severity) =>
      setEvents(e => [{ id: Date.now() + Math.random(), ts, event, duration, severity }, ...e].slice(0, 30));

    // Parcel presence
    if (prev.parcel_present !== shelfData.parcel_present) {
      addEvent(
        shelfData.parcel_present ? 'Parcel loaded onto shelf' : 'Parcel removed from shelf',
        '—',
        shelfData.parcel_present ? 'success' : 'warning',
      );
    }

    // Vibration
    if (!prev.vibration && shelfData.vibration) {
      const label = format(ts, 'HH:mm:ss');
      setVibH(h => [...h, { time: label, count: 1 }].slice(-20));
      addEvent('Impact / vibration detected', '—', 'warning');
    }

    // Reed switch — supports both field names
    const prevOpen = isContainerOpen(prev);
    const currOpen = isContainerOpen(shelfData);
    const moving   = (shelfData.speed_kmh ?? 0) > 2; // if speed passed through

    if (!prevOpen && currOpen) {
      const isTamper = shelfData.status === 'tampered' || moving;
      addEvent(
        isTamper ? '⚠ Tamper — latch opened while moving' : 'Container / door opened',
        '—',
        isTamper ? 'critical' : 'info',
      );
    }
    if (prevOpen && !currOpen) {
      addEvent('Container / door closed', '—', 'success');
    }


  }, [shelfData]);

  const tamperCount = events.filter(e => e.severity === 'critical').length;
  const vibCount    = vibHistory.length;
  const occTime     = occupancy.filter(o => o.occupied).length;
  const occRate     = occupancy.length > 1
    ? Math.round((occTime / occupancy.length) * 100)
    : (shelfData?.parcel_present ? 100 : 0);

  return { events, vibHistory, occupancy, vibCount, tamperCount, occRate };
}

// ─── Severity badge styles ────────────────────────────────────────────────────
const SEV = {
  info:     'text-blue-400 bg-blue-500/10 border border-blue-500/20',
  warning:  'text-amber-400 bg-amber-500/10 border border-amber-500/20',
  success:  'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
  critical: 'text-red-400 bg-red-500/10 border border-red-500/20 font-bold',
};

// ─── Shelf detail card ────────────────────────────────────────────────────────
function ShelfDetailCard({ shelfNumber, shelfData }) {
  const { events, vibHistory, occupancy, vibCount, tamperCount, occRate } =
    useShelfHistory(shelfData);

  const occupied      = shelfData?.parcel_present ?? false;
  const vibrating     = shelfData?.vibration      ?? false;
  const containerOpen = isContainerOpen(shelfData);
  const irActive      = shelfData?.ir_active      ?? false;
  const tampered      = shelfData?.status === 'tampered';

  // Build occupancy timeline segments
  const totalSeg = occupancy.length || 1;
  const segments = [];
  let i = 0;
  while (i < occupancy.length) {
    let j = i;
    while (j < occupancy.length && occupancy[j].occupied === occupancy[i].occupied) j++;
    segments.push({ occupied: occupancy[i].occupied, pct: ((j - i) / totalSeg) * 100 });
    i = j;
  }

  return (
    <div className={`bg-slate-800 border rounded-xl p-6 space-y-6 shadow-lg transition-all duration-300 ${
      tampered        ? 'border-red-600/80 shadow-red-900/20'
      : vibrating     ? 'border-red-500/50'
      : containerOpen ? 'border-amber-500/40'
      : occupied      ? 'border-emerald-500/20'
      : 'border-slate-700'
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Shelf {shelfNumber}</h2>
        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold uppercase ${
          tampered
            ? 'bg-red-600/20 text-red-400 border border-red-500/40 animate-pulse'
            : occupied
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-slate-700 text-slate-400 border border-slate-600'
        }`}>
          {tampered ? 'TAMPERED' : occupied ? 'OCCUPIED' : 'EMPTY'}
        </span>
      </div>

      {/* Sensor status */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${
          irActive ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-900/40 border-slate-700'
        }`}>
          <Zap size={16} className={irActive ? 'text-blue-400' : 'text-slate-600'}/>
          <span className="text-xs text-slate-400 font-medium text-center">Shelf Occupied</span>
          <span className={`text-xs font-bold ${irActive ? 'text-blue-400' : 'text-slate-500'}`}>
            {irActive ? 'YES' : 'NO'}
          </span>
        </div>

        <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${
          vibrating ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900/40 border-slate-700'
        }`}>
          <Activity size={16} className={vibrating ? 'text-red-400 animate-pulse' : 'text-slate-600'}/>
          <span className="text-xs text-slate-400 font-medium text-center">Impact Detected</span>
          <span className={`text-xs font-bold ${vibrating ? 'text-red-400' : 'text-slate-500'}`}>
            {vibrating ? 'YES' : 'NO'}
          </span>
        </div>

        <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border ${
          tampered        ? 'bg-red-600/15 border-red-500/40'
          : containerOpen ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-slate-900/40 border-slate-700'
        }`}>
          {containerOpen
            ? <DoorOpen size={16} className={tampered ? 'text-red-400 animate-pulse' : 'text-amber-400'}/>
            : <DoorClosed size={16} className="text-slate-600"/>}
          <span className="text-xs text-slate-400 font-medium">Latch</span>
          <span className={`text-xs font-bold ${
            tampered ? 'text-red-400 animate-pulse' : containerOpen ? 'text-amber-400' : 'text-slate-500'
          }`}>
            {tampered ? 'TAMPER!' : containerOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
      </div>

      {/* Tamper banner */}
      {tampered && (
        <div className="flex items-center gap-2 bg-red-600/15 border border-red-500/40 rounded-lg px-3 py-2">
          <ShieldAlert size={14} className="text-red-400 animate-pulse flex-shrink-0"/>
          <span className="text-red-400 text-sm font-semibold">
            Container opened while vehicle is moving — possible tamper!
          </span>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left — parcel + vibration chart */}
        <div className="space-y-4">
          <div className="flex justify-center items-center h-28 bg-slate-900/60 rounded-xl">
            {occupied
              ? <Package size={64} className="text-emerald-400 bounce-slow drop-shadow-lg"/>
              : <PackageOpen size={64} className="text-slate-600"/>
            }
          </div>

          {vibrating && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <Activity size={14} className="text-red-400 animate-pulse"/>
              <span className="text-red-400 text-sm font-semibold">Vibration Active</span>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">
              Vibration History
            </p>
            <div style={{ height: 100 }}>
              {vibHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                  No vibration events this session
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vibHistory} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                    <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval="preserveStartEnd"/>
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} allowDecimals={false}/>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#94a3b8' }}/>
                    <Bar dataKey="count" fill="#ef4444" radius={[2,2,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Right — event log */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Event Log</p>
            <span className="text-xs text-slate-500 font-mono">{events.length} event{events.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {events.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-6">Waiting for events...</p>
            ) : (
              events.map(e => (
                <div key={e.id} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${SEV[e.severity] ?? SEV.info}`}>
                  <div className="flex-shrink-0 pt-0.5">
                    <Clock size={10} className="opacity-60"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight">{e.event}</p>
                    <p className="text-xs opacity-60 font-mono mt-0.5">{format(e.ts, 'HH:mm:ss')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Occupancy timeline */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
          Occupancy Timeline
        </p>
        <div className="occupancy-timeline border border-slate-700 rounded overflow-hidden" style={{ height: 20 }}>
          {segments.length === 0 ? (
            <div
              style={{ flex: 1, background: shelfData?.parcel_present ? '#22c55e' : '#1e293b', height: 20 }}
            />
          ) : (
            segments.map((seg, i) => (
              <div
                key={i}
                className="timeline-segment"
                style={{ flex: seg.pct, background: seg.occupied ? '#22c55e' : '#1e293b', height: 20, minWidth: 1 }}
              />
            ))
          )}
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Session start</span>
          <span>Now</span>
        </div>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-4 gap-3 border-t border-slate-700 pt-4">
        {[
          { label: 'Total Events',  value: events.length                          },
          { label: 'Vibrations',    value: vibCount                               },
          { label: 'Tamper Alerts', value: tamperCount, danger: tamperCount > 0   },
          { label: 'Occupancy',     value: `${occRate}%`                          },
        ].map(({ label, value, danger }) => (
          <div key={label} className="text-center">
            <p className={`font-bold text-xl ${danger ? 'text-red-400' : 'text-white'}`}>{value}</p>
            <p className="text-slate-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ShelvesPage() {
  const { data } = useContext(AppContext);
  const shelves  = data?.shelves ?? {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Package size={20} className="text-blue-400"/>
        <h1 className="text-white font-bold text-xl">Shelf Management</h1>
      </div>
      {[1, 2, 3].map(n => (
        <ShelfDetailCard
          key={n}
          shelfNumber={n}
          shelfData={shelves[`shelf_${n}`]}
        />
      ))}
    </div>
  );
}