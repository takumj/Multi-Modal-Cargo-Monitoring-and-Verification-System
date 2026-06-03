import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const MAX_POINTS = 60;

const TABS = ['Attitude', 'Acceleration', 'Speed'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {Number(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  );
};

export default function LiveChart({ imu, gps }) {
  const [tab,        setTab]        = useState(0);
  const [chartData,  setChartData]  = useState({ attitude: [], acceleration: [], speed: [] });
  const histRef = useRef({ attitude: [], acceleration: [], speed: [] });

  useEffect(() => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (imu) {
      histRef.current.attitude = [...histRef.current.attitude, {
        time:  ts,
        roll:  +(imu.roll  ?? 0).toFixed(2),
        pitch: +(imu.pitch ?? 0).toFixed(2),
      }].slice(-MAX_POINTS);

      histRef.current.acceleration = [...histRef.current.acceleration, {
        time:   ts,
        accelX: +(imu.accelX ?? 0).toFixed(3),
        accelY: +(imu.accelY ?? 0).toFixed(3),
        accelZ: +(imu.accelZ ?? 0).toFixed(3),
      }].slice(-MAX_POINTS);
    }

    if (gps) {
      histRef.current.speed = [...histRef.current.speed, {
        time:  ts,
        speed: +(gps.speed_kmh ?? 0).toFixed(1),
      }].slice(-MAX_POINTS);
    }

    setChartData({
      attitude:     [...histRef.current.attitude],
      acceleration: [...histRef.current.acceleration],
      speed:        [...histRef.current.speed],
    });
  }, [imu, gps]);

  const commonProps = {
    margin: { top: 5, right: 10, left: -20, bottom: 0 },
  };

  const axisProps = {
    xAxis: <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />,
    yAxis: <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />,
    grid:  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />,
    tip:   <Tooltip content={<CustomTooltip />} />,
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-900/60 rounded-lg p-1">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
              tab === i
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="flex-1 min-h-0">
        {tab === 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.attitude} {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tip}
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="roll"  stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="pitch" stroke="#a855f7" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.acceleration} {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tip}
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="accelX" stroke="#ef4444" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="accelY" stroke="#22c55e" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="accelZ" stroke="#f59e0b" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === 2 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.speed} {...commonProps}>
              {axisProps.grid}
              {axisProps.xAxis}
              {axisProps.yAxis}
              {axisProps.tip}
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="speed" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
