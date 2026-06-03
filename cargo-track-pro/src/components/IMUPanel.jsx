import { useRef, useState, useEffect } from 'react';
import { Compass, AlertTriangle, CheckCircle } from 'lucide-react';

// ─── Tilt bar with colour zones ───────────────────────────────────────────────
function TiltBar({ label, value, min = -30, max = 30 }) {
  const clamp     = Math.max(min, Math.min(max, value ?? 0));
  const range     = max - min;
  const midPct    = ((-min) / range) * 100;
  const fillLeft  = clamp >= 0 ? midPct : ((clamp - min) / range) * 100;
  const fillWidth = (Math.abs(clamp) / range) * 100;
  const abs       = Math.abs(clamp);

  const color       = abs > 15 ? '#ef4444' : abs > 8 ? '#f59e0b' : '#22c55e';
  const status      = abs > 15 ? 'DANGER'  : abs > 8 ? 'CAUTION' : 'SAFE';
  const statusColor = abs > 15 ? 'text-red-400' : abs > 8 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
          <span className="text-xs font-mono font-bold" style={{ color }}>
            {clamp >= 0 ? '+' : ''}{clamp.toFixed(1)}°
          </span>
        </div>
      </div>

      <div className="relative h-2.5 rounded-full overflow-hidden">
        {/* Colour zones */}
        <div className="absolute inset-0 flex">
          <div style={{ width: '27%', background: '#ef444466' }} />
          <div style={{ width: '23%', background: '#f59e0b55' }} />
          <div style={{ width: '20%', background: '#22c55e55' }} />
          <div style={{ width: '23%', background: '#f59e0b55' }} />
          <div style={{ width: '27%', background: '#ef444466' }} />
        </div>
        {/* Centre tick */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10" style={{ left: `${midPct}%` }} />
        {/* Value fill */}
        <div
          className="absolute top-0 bottom-0 rounded-sm transition-all duration-300 z-20"
          style={{ left: `${fillLeft}%`, width: `${Math.max(fillWidth, 1.5)}%`, background: color }}
        />
      </div>

      <div className="flex justify-between text-slate-500 text-xs">
        <span>-30°</span><span>Safe: ±8°</span><span>+30°</span>
      </div>
    </div>
  );
}

// ─── 3D box ───────────────────────────────────────────────────────────────────
function Box3D({ roll, pitch }) {
  const style = {
    width: 80, height: 80,
    position: 'relative',
    transformStyle: 'preserve-3d',
    transform: `rotateX(${-pitch}deg) rotateZ(${roll}deg)`,
    transition: 'transform 0.4s ease-out',
  };
  const face = (transform, opacity = 0.15) => ({
    position: 'absolute',
    width: 80, height: 80,
    border: '2px solid rgba(59,130,246,0.6)',
    background: `rgba(59,130,246,${opacity})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 600,
    color: 'rgba(148,163,184,0.8)',
    transform,
  });

  return (
    <div style={{ perspective: 400, perspectiveOrigin: '50% 50%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={style}>
        <div style={face('translateZ(40px)',       0.15)}>F</div>
        <div style={face('rotateY(180deg) translateZ(40px)', 0.10)}>B</div>
        <div style={face('rotateY(-90deg) translateZ(40px)', 0.10)}>L</div>
        <div style={face('rotateY(90deg) translateZ(40px)',  0.10)}>R</div>
        <div style={face('rotateX(90deg) translateZ(40px)',  0.20)}>T</div>
        <div style={face('rotateX(-90deg) translateZ(40px)', 0.08)}>D</div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function IMUPanel({ imu }) {
  const roll    = imu?.roll        ?? 0;
  const pitch   = imu?.pitch       ?? 0;
  const tiltAng = imu?.tilt_angle  ?? 0;
  const tilted  = imu?.tilted      ?? false;   // firmware-calculated
  const orient  = imu?.orientation ?? 'LEVEL'; // firmware-calculated

  // Use firmware's own tilted flag for shock alert, not hardcoded physics
  const [lastShock, setLastShock] = useState(null);
  const prevTiltedRef = useRef(false);

  useEffect(() => {
    if (tilted && !prevTiltedRef.current) {
      setLastShock(new Date().toLocaleTimeString());
    }
    prevTiltedRef.current = tilted;
  }, [tilted]);

  // Status badge driven by firmware orientation field
  const abs         = Math.abs(tiltAng);
  const statusLabel = orient === 'LEVEL' ? 'LEVEL' : abs > 15 ? 'CRITICAL TILT' : 'TILTED';
  const statusColor =
    orient !== 'LEVEL' && abs > 15
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : orient !== 'LEVEL'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-blue-400" />
          <h3 className="text-white font-semibold">Vehicle Tilt Monitor</h3>
        </div>
        <span className={`px-2 py-1 rounded-md text-xs font-bold border ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Tilt bars */}
      <div className="space-y-4">
        <TiltBar label="Side Tilt (Left / Right)" value={roll}  />
        <TiltBar label="Front / Back Tilt"        value={pitch} />
      </div>

      {/* Overall tilt */}
      <div className="flex items-center justify-between bg-slate-900/60 rounded-lg px-4 py-3">
        <div>
          <p className="text-slate-400 text-sm">Overall Tilt</p>
          <p className="text-slate-500 text-xs mt-0.5">Combined angle from level</p>
        </div>
        <span className="text-3xl font-bold font-mono"
          style={{ color: abs > 15 ? '#ef4444' : abs > 8 ? '#f59e0b' : '#22c55e' }}>
          {tiltAng.toFixed(1)}°
        </span>
      </div>

      {/* Cargo forces */}

      {/* Sharp movement — driven by firmware tilted flag */}
      <div className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
        tilted
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-slate-900/60 border-slate-700/40'
      }`}>
        {tilted
          ? <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          : <CheckCircle   size={14} className="text-emerald-400 flex-shrink-0" />
        }
        <div>
          <p className={`text-xs font-semibold ${tilted ? 'text-red-400' : 'text-slate-400'}`}>
            {tilted ? 'Tilt detected by sensor' : 'Last tilt event'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {tilted ? 'Cargo may have shifted' : lastShock ? `At ${lastShock}` : 'None this session'}
          </p>
        </div>
      </div>

      {/* 3D orientation — fully inline styles, no CSS class dependency */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">
          Cargo Compartment Orientation
        </span>
        <Box3D roll={roll} pitch={pitch} />
      </div>

    </div>
  );
}