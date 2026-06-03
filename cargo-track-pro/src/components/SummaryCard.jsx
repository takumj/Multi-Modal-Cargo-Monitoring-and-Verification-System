export default function SummaryCard({ title, value, icon: Icon, color, pulse = false, subtitle }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-600/10',   border: 'border-blue-500/30',   icon: 'text-blue-400',   val: 'text-blue-300'   },
    green:  { bg: 'bg-emerald-600/10',border: 'border-emerald-500/30',icon: 'text-emerald-400',val: 'text-emerald-300'},
    red:    { bg: 'bg-red-600/10',    border: 'border-red-500/30',    icon: 'text-red-400',    val: 'text-red-300'    },
    amber:  { bg: 'bg-amber-600/10',  border: 'border-amber-500/30',  icon: 'text-amber-400',  val: 'text-amber-300'  },
    purple: { bg: 'bg-purple-600/10', border: 'border-purple-500/30', icon: 'text-purple-400', val: 'text-purple-300' },
  };

  const c = colorMap[color] ?? colorMap.blue;

  return (
    <div
      className={`${c.bg} border ${c.border} rounded-xl p-5 flex items-center gap-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:border-blue-500/50`}
      style={pulse ? { animation: 'pulse-ring 1.5s ease-out infinite' } : {}}
    >
      <div className={`w-12 h-12 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider truncate">{title}</p>
        <p className={`${c.val} text-2xl font-bold leading-tight mt-0.5`}>{value}</p>
        {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
