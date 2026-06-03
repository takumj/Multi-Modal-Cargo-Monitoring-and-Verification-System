import { Navigation, Satellite } from 'lucide-react';

function SignalBars({ satellites }) {
  const sats  = satellites ?? 0;
  const bars  = Math.min(5, Math.floor((sats / 12) * 5));
  const color = bars >= 4 ? '#22c55e' : bars >= 2 ? '#f59e0b' : '#ef4444';
  const heights = [8, 12, 16, 20, 24];

  return (
    <div className="signal-bars">
      {heights.map((h, i) => (
        <div
          key={i}
          className="signal-bar"
          style={{
            height: `${h}px`,
            background: i < bars ? color : '#334155',
          }}
        />
      ))}
    </div>
  );
}

export default function GPSPanel({ gps }) {
  const lat   = gps?.latitude   ?? 0;
  const lng   = gps?.longitude  ?? 0;
  const alt   = gps?.altitude_m ?? 0;
  const spd   = gps?.speed_kmh  ?? 0;
  const sats  = gps?.satellites ?? 0;
  const valid = gps?.valid      ?? false;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-emerald-400" />
          <h3 className="text-white font-semibold">GPS / Vehicle</h3>
        </div>
        <span
          className={`px-2 py-1 rounded-md text-xs font-bold border ${
            valid
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30 pulse-ring-amber'
          }`}
        >
          {valid ? 'LOCKED' : 'SEARCHING'}
        </span>
      </div>

      {/* Speed — large display */}
      <div className="text-center bg-slate-900/60 rounded-xl py-5">
        <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Speed</p>
        <p className="text-6xl font-black text-white font-mono leading-none">
          {spd.toFixed(0)}
        </p>
        <p className="text-slate-400 text-sm mt-1">km/h</p>
      </div>

      {/* Coordinates */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-xs">Latitude</span>
          <span className="text-slate-200 font-mono text-sm font-semibold">
            {lat.toFixed(6)}°
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-xs">Longitude</span>
          <span className="text-slate-200 font-mono text-sm font-semibold">
            {lng.toFixed(6)}°
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-xs">Altitude</span>
          <span className="text-slate-200 font-mono text-sm font-semibold">
            {alt.toFixed(0)} m
          </span>
        </div>
      </div>

      {/* Satellites */}
      <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <Satellite size={14} className="text-slate-400" />
          <span className="text-slate-400 text-sm">Satellites</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-200 font-mono font-bold">{sats}</span>
          <SignalBars satellites={sats} />
        </div>
      </div>
    </div>
  );
}
