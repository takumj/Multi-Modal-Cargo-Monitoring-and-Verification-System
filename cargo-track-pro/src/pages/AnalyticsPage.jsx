import { useContext, useEffect, useRef, useState } from 'react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BarChart2, Download, Package, Vibrate, Layers } from 'lucide-react';
import { AppContext } from '../App';

const SHELF_COLORS = ['#3b82f6', '#22c55e', '#a855f7'];

// ─── Pillar card ──────────────────────────────────────────────────────────────
function PillarCard({ title, subtitle, value, unit, icon: Icon, color, badge, badgeColor }) {
  const colorMap = {
    blue:   'text-blue-400    bg-blue-500/10    border-blue-500/20',
    green:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber:  'text-amber-400   bg-amber-500/10   border-amber-500/20',
    purple: 'text-purple-400  bg-purple-500/10  border-purple-500/20',
  };
  const badgeMap = {
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    amber: 'text-amber-400   bg-amber-500/10   border-amber-500/30',
    red:   'text-red-400     bg-red-500/10     border-red-500/30',
  };
  return (
    <div className={`border rounded-xl p-5 ${colorMap[color] ?? colorMap.blue} shadow-lg flex flex-col gap-3`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider font-medium">{title}</p>
          <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
        </div>
        <Icon size={16} className="mt-0.5 opacity-80" />
      </div>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-black">
          {value}
          {unit && <span className="text-sm font-normal ml-1 text-slate-400">{unit}</span>}
        </p>
        {badge && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badgeMap[badgeColor] ?? badgeMap.green}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Shelf occupancy bars ─────────────────────────────────────────────────────
function OccupancyBars({ occupancyTime, shelfCounts }) {
  const total = Math.max(1, occupancyTime.shelf_1 + occupancyTime.shelf_2 + occupancyTime.shelf_3);
  const shelves = [
    { label: 'Shelf 1', key: 'shelf_1', pct: Math.round((occupancyTime.shelf_1 / total) * 100) },
    { label: 'Shelf 2', key: 'shelf_2', pct: Math.round((occupancyTime.shelf_2 / total) * 100) },
    { label: 'Shelf 3', key: 'shelf_3', pct: Math.round((occupancyTime.shelf_3 / total) * 100) },
  ];
  return (
    <div className="space-y-5">
      {shelves.map((s, i) => (
        <div key={s.key} className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: SHELF_COLORS[i] }} />
              <span className="text-slate-300 font-medium">{s.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500">{shelfCounts[s.key]} load{shelfCounts[s.key] !== 1 ? 's' : ''}</span>
              <span className="font-mono font-semibold w-8 text-right" style={{ color: SHELF_COLORS[i] }}>{s.pct}%</span>
            </div>
          </div>
          <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${s.pct}%`, background: SHELF_COLORS[i] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Per-shelf vibration breakdown ───────────────────────────────────────────
function VibrationByShelf({ vibByShelf }) {
  const total = Math.max(1, vibByShelf.shelf_1 + vibByShelf.shelf_2 + vibByShelf.shelf_3);
  return (
    <div className="space-y-4">
      {[
        { label: 'Shelf 1', key: 'shelf_1' },
        { label: 'Shelf 2', key: 'shelf_2' },
        { label: 'Shelf 3', key: 'shelf_3' },
      ].map(({ label, key }, i) => {
        const count = vibByShelf[key];
        const pct   = Math.round((count / total) * 100);
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: SHELF_COLORS[i] }} />
                <span className="text-slate-300 font-medium">{label}</span>
              </div>
              <span className="font-mono font-semibold text-white">{count} event{count !== 1 ? 's' : ''}</span>
            </div>
            <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: SHELF_COLORS[i] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tooltip style ────────────────────────────────────────────────────────────
const ttStyle  = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11, color: '#f1f5f9' };
const lblStyle = { color: '#94a3b8' };

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data }        = useContext(AppContext);
  const sessionStartRef = useRef(Date.now());

  const statsRef = useRef({
    totalParcels:    0,
    vibrationEvents: 0,
    shelfCounts:     { shelf_1: 0, shelf_2: 0, shelf_3: 0 },
    vibByShelf:      { shelf_1: 0, shelf_2: 0, shelf_3: 0 },
    vibOverTime:     [],
    occupancyTime:   { shelf_1: 0, shelf_2: 0, shelf_3: 0 },
  });

  const [stats, setStats] = useState({ ...statsRef.current });
  const prevRef           = useRef(null);

  useEffect(() => {
    if (!data) { prevRef.current = data; return; }
    const prev = prevRef.current;
    prevRef.current = data;
    const s = statsRef.current;

    // Shelf events
    ['shelf_1', 'shelf_2', 'shelf_3'].forEach(id => {
      const curr = data.shelves?.[id];
      if (curr?.parcel_present) s.occupancyTime[id]++;
      if (!prev) return;
      const p = prev.shelves?.[id];
      if (p && !p.parcel_present && curr?.parcel_present) {
        s.shelfCounts[id]++;
        s.totalParcels++;
      }
      if (p && !p.vibration && curr?.vibration) {
        s.vibrationEvents++;
        s.vibByShelf[id]++;
      }
    });

    // Vibration over time (1-min bins)
    const minElapsed = Math.floor((Date.now() - sessionStartRef.current) / 60000);
    if (!s.vibOverTime[minElapsed]) {
      s.vibOverTime[minElapsed] = { time: `${minElapsed}m`, count: 0 };
    }
    if (data.summary?.any_vibration) s.vibOverTime[minElapsed].count++;

    setStats({ ...s });
  }, [data]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const vibLineData  = stats.vibOverTime.slice(-15).filter(Boolean);
  const sessionMins  = Math.max(1, Math.floor((Date.now() - sessionStartRef.current) / 60000));

  // Shelf utilisation: % of shelves occupied on average across the session
  const occTotal  = stats.occupancyTime.shelf_1 + stats.occupancyTime.shelf_2 + stats.occupancyTime.shelf_3;
  // Each tick = 1 slot; 3 shelves × ticks = max possible
  const maxSlots  = sessionMins * 60 * 3; // rough upper bound (ticks ≈ seconds)
  const utilPct   = maxSlots > 0 ? Math.min(100, Math.round((occTotal / maxSlots) * 100)) : 0;

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Metric', 'Value'],
      ['Session Duration (min)',      sessionMins],
      ['Total Parcels Detected',      stats.totalParcels],
      ['Total Vibration Events',      stats.vibrationEvents],
      ['Vibrations — Shelf 1',        stats.vibByShelf.shelf_1],
      ['Vibrations — Shelf 2',        stats.vibByShelf.shelf_2],
      ['Vibrations — Shelf 3',        stats.vibByShelf.shelf_3],
      ['Shelf 1 Parcel Loads',        stats.shelfCounts.shelf_1],
      ['Shelf 2 Parcel Loads',        stats.shelfCounts.shelf_2],
      ['Shelf 3 Parcel Loads',        stats.shelfCounts.shelf_3],
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cargotrack-session-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={20} className="text-blue-400" />
          <div>
            <h1 className="text-white font-bold text-xl leading-tight">Session Analytics</h1>
            <p className="text-slate-500 text-xs">Smart shelf monitoring · {sessionMins} min session</p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/40 rounded-lg text-sm font-semibold hover:bg-blue-600/30 transition-colors"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Three core stat cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PillarCard
          title="Parcels Detected"
          subtitle="Unique parcel load events this session"
          value={stats.totalParcels}
          unit="parcels"
          icon={Package}
          color="green"
        />
        <PillarCard
          title="Vibration Alerts"
          subtitle="Impact events detected across all shelves"
          value={stats.vibrationEvents}
          icon={Vibrate}
          color="amber"
          badge={stats.vibrationEvents === 0 ? 'ALL CLEAR' : 'IMPACTS DETECTED'}
          badgeColor={stats.vibrationEvents === 0 ? 'green' : 'amber'}
        />
        <PillarCard
          title="Shelf Utilisation"
          subtitle="Average occupancy across all three shelves"
          value={utilPct}
          unit="%"
          icon={Layers}
          color="purple"
        />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Shelf occupancy + load counts */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold text-sm">Shelf Occupancy</h3>
          <p className="text-slate-500 text-xs mt-0.5 mb-5">
            Share of session time each shelf held a parcel, with total load events
          </p>
          <OccupancyBars
            occupancyTime={stats.occupancyTime}
            shelfCounts={stats.shelfCounts}
          />
        </div>

        {/* Vibration timeline + per-shelf breakdown */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold text-sm">Vibration Timeline</h3>
          <p className="text-slate-500 text-xs mt-0.5 mb-4">Impact events per minute, broken down by shelf</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart
              data={vibLineData.length ? vibLineData : [{ time: '0m', count: 0 }]}
              margin={{ top: 4, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={ttStyle} labelStyle={lblStyle} />
              <Line
                type="monotone" dataKey="count" stroke="#f59e0b"
                dot={false} strokeWidth={2} isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">By Shelf</p>
            <VibrationByShelf vibByShelf={stats.vibByShelf} />
          </div>
        </div>
      </div>

      {/* ── Session summary ──────────────────────────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">Session Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Duration',         val: `${sessionMins} min`           },
            { label: 'Parcels Detected', val: String(stats.totalParcels)     },
            { label: 'Vibration Events', val: String(stats.vibrationEvents)  },
            { label: 'Shelf Utilisation',val: `${utilPct}%`                  },
          ].map(({ label, val }) => (
            <div key={label} className="space-y-1">
              <p className="text-slate-500 text-xs uppercase tracking-wider">{label}</p>
              <p className="font-mono font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}