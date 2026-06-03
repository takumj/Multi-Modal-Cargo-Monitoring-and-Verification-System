import { Package, PackageOpen, Activity, Clock, DoorOpen, DoorClosed, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRef } from 'react';

export default function ShelfCard({ shelfNumber, data }) {
  const lastEventRef = useRef(new Date());
  const occupied      = data?.parcel_present  ?? false;
  const vibrating     = data?.vibration       ?? false;
  const containerOpen = data?.container_open  ?? false;
  const irActive      = data?.ir_active       ?? false;
  const tampered      = data?.status === 'tampered';

  if (data?.parcel_present !== undefined) {
    lastEventRef.current = new Date();
  }

  return (
    <div
      className={`bg-slate-800 border rounded-xl p-5 flex flex-col gap-4 shadow-lg transition-all duration-300 ${
        tampered
          ? 'border-red-600/80 shadow-red-900/30'
          : vibrating
          ? 'border-red-500/60'
          : containerOpen
          ? 'border-amber-500/50'
          : occupied
          ? 'border-emerald-500/30 hover:border-emerald-500/50'
          : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-slate-300 font-semibold text-base">Shelf {shelfNumber}</span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            tampered
              ? 'bg-red-600/20 text-red-400 border border-red-500/40 animate-pulse'
              : occupied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-700 text-slate-400 border border-slate-600'
          }`}
        >
          {tampered ? 'TAMPERED' : occupied ? 'OCCUPIED' : 'EMPTY'}
        </span>
      </div>

      {/* Icon */}
      <div className="flex justify-center">
        {occupied ? (
          <Package size={48} className="text-emerald-400 bounce-slow drop-shadow-lg" />
        ) : (
          <PackageOpen size={48} className="text-slate-600" />
        )}
      </div>

      {/* Sensor rows */}
      <div className="space-y-2">
        {/* Vibration */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={13} className={vibrating ? 'text-red-400' : 'text-slate-500'} />
              <span className="text-xs text-slate-400">Impact Detected</span>
            </div>
            {vibrating && <span className="text-xs text-red-400 font-semibold animate-pulse">ACTIVE</span>}
          </div>
          <div className="gauge-track">
            <div className={`gauge-fill ${vibrating ? 'bg-red-500' : 'bg-slate-600'}`} style={{ width: vibrating ? '100%' : '0%' }} />
          </div>
        </div>

        {/* Reed switch */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {containerOpen
              ? <DoorOpen size={13} className={tampered ? 'text-red-400' : 'text-amber-400'} />
              : <DoorClosed size={13} className="text-slate-500" />}
            <span className="text-xs text-slate-400">Latch</span>
          </div>
          <span className={`text-xs font-semibold ${
            tampered        ? 'text-red-400 animate-pulse'
            : containerOpen ? 'text-amber-400'
            : 'text-slate-500'
          }`}>
            {tampered ? 'TAMPER!' : containerOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>

        {/* IR sensor */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={13} className={irActive ? 'text-blue-400' : 'text-slate-500'} />
            <span className="text-xs text-slate-400">Shelf Occupied</span>
          </div>
          <span className={`text-xs font-semibold ${irActive ? 'text-blue-400' : 'text-slate-500'}`}>
            {irActive ? 'YES' : 'NO'}
          </span>
        </div>
      </div>

      {/* Last event */}
      <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-700 pt-3">
        <Clock size={12} />
        <span>Last event: {formatDistanceToNow(lastEventRef.current, { addSuffix: true })}</span>
      </div>
    </div>
  );
}