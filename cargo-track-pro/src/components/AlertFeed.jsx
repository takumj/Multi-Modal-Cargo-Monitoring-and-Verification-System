import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, Clock, Search, Radio } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { searchAlerts, clearStoredAlerts } from '../hooks/useAlertFeed';

// ─── Severity config ──────────────────────────────────────────────────────────
const SEVERITY_STYLES = {
  info:     { border: 'border-blue-500',    bg: 'bg-blue-500/10',    icon: Info,          iconColor: 'text-blue-400'    },
  warning:  { border: 'border-amber-500',   bg: 'bg-amber-500/10',   icon: AlertTriangle, iconColor: 'text-amber-400'   },
  critical: { border: 'border-red-500',     bg: 'bg-red-500/10',     icon: XCircle,       iconColor: 'text-red-400'     },
  success:  { border: 'border-emerald-500', bg: 'bg-emerald-500/10', icon: CheckCircle,   iconColor: 'text-emerald-400' },
};

// ─── Single alert row ─────────────────────────────────────────────────────────
function AlertItem({ alert, index, isStored }) {
  const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;
  const Icon  = style.icon;
  const ts    = typeof alert.timestamp === 'string' ? new Date(alert.timestamp) : alert.timestamp;

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border-l-2 ${style.border} ${style.bg} ${!isStored && index === 0 ? 'slide-in-left' : ''}`}>
      <Icon size={14} className={`${style.iconColor} mt-0.5 flex-shrink-0`}/>
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-xs font-medium leading-snug">{alert.message}</p>
        {alert.shelf && (
          <p className="text-slate-500 text-xs capitalize">{alert.shelf.replace('_', ' ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Clock size={10} className="text-slate-600"/>
        <span className="text-slate-500 text-xs">
          {isStored
            ? ts.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : formatDistanceToNow(ts, { addSuffix: true })
          }
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AlertFeed({ alerts }) {
  const [view,       setView]       = useState('live');   // 'live' | 'search'
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterFrom, setFilterFrom] = useState('00:00');
  const [filterTo,   setFilterTo]   = useState('23:59');
  const [results,    setResults]    = useState([]);
  const [searched,   setSearched]   = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  function handleSearch() {
    const found = searchAlerts({ date: filterDate, from: filterFrom, to: filterTo });
    setResults(found);
    setSearched(true);
  }

  function handleClear() {
    if (!window.confirm('Clear all stored alerts? This cannot be undone.')) return;
    clearStoredAlerts();
    setResults([]);
    setSearched(false);
  }

  const displayLive = alerts.slice(0, 20);

  // Severity counts for live view
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount  = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-white font-semibold">Alert Feed</h3>
        {alerts.length > 0 && (
          <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-4 bg-slate-900/60 rounded-lg p-1 flex-shrink-0">
        <button
          onClick={() => setView('live')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            view === 'live' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio size={11}/> Live
        </button>
        <button
          onClick={() => setView('search')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            view === 'search' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search size={11}/> Search
        </button>
      </div>

      {/* ── LIVE VIEW ─────────────────────────────────────────────────────── */}
      {view === 'live' && (
        <>
          {/* Quick stats */}
          {alerts.length > 0 && (
            <div className="flex gap-2 mb-3 flex-shrink-0">
              {criticalCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  {criticalCount} critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {warningCount} warning
                </span>
              )}
            </div>
          )}

          {displayLive.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <CheckCircle size={32} className="text-slate-600 mb-3"/>
              <p className="text-slate-500 text-sm">No alerts</p>
              <p className="text-slate-600 text-xs">System nominal</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {displayLive.map((alert, i) => (
                <AlertItem key={alert.id} alert={alert} index={i} isStored={false}/>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SEARCH VIEW ───────────────────────────────────────────────────── */}
      {view === 'search' && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">

          {/* Filters */}
          <div className="space-y-2 flex-shrink-0">
            <div className="space-y-1">
              <label className="text-slate-500 text-xs">Date</label>
              <input
                type="date" value={filterDate} max={today}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-slate-500 text-xs">From</label>
                <input
                  type="time" value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 text-xs">To</label>
                <input
                  type="time" value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              className="w-full py-2 bg-blue-600/20 text-blue-400 border border-blue-500/40 rounded-lg text-xs font-semibold hover:bg-blue-600/30 transition-colors"
            >
              Search
            </button>
          </div>

          {/* Results */}
          {!searched && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Search size={24} className="text-slate-600 mb-2"/>
              <p className="text-slate-500 text-xs">Enter a date and time range to search stored alerts.</p>
            </div>
          )}

          {searched && results.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <CheckCircle size={24} className="text-slate-600 mb-2"/>
              <p className="text-slate-500 text-xs">No alerts found for that period.</p>
            </div>
          )}

          {searched && results.length > 0 && (
            <>
              {/* Result count + date header */}
              <div className="flex items-center justify-between flex-shrink-0">
                <p className="text-slate-400 text-xs font-semibold">
                  {results.length} alert{results.length !== 1 ? 's' : ''} on {new Date(filterDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <div className="flex gap-2">
                  {['critical','warning','info','success'].map(s => {
                    const count = results.filter(a => a.severity === s).length;
                    if (!count) return null;
                    const cls = { critical:'text-red-400', warning:'text-amber-400', info:'text-blue-400', success:'text-emerald-400' }[s];
                    return <span key={s} className={`text-xs font-mono ${cls}`}>{count} {s}</span>;
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {results.map((alert, i) => (
                  <AlertItem key={`${alert.id}-${i}`} alert={alert} index={i} isStored={true}/>
                ))}
              </div>

              <button
                onClick={handleClear}
                className="flex-shrink-0 w-full py-2 bg-red-600/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-600/20 transition-colors"
              >
                Clear all stored alerts
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}