import { useContext } from 'react';
import { Package, Gauge, Bell } from 'lucide-react';
import { AppContext } from '../App';
import SummaryCard from '../components/SummaryCard';
import ShelfCard   from '../components/ShelfCard';
import IMUPanel    from '../components/IMUPanel';
import AlertFeed   from '../components/AlertFeed';

export default function Dashboard() {
  const { data, alerts, criticalCount } = useContext(AppContext);

  const shelves = data?.shelves ?? {};
  const imu     = data?.vehicle?.imu ?? {};
  const summary = data?.summary ?? {};

  const occupied = summary.occupied_shelves ?? 0;
  const tilted   = summary.vehicle_tilted   ?? false;

  return (
    <div className="p-6 space-y-6">

      {/* Row 1 — Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Occupied Shelves"
          value={`${occupied} / 3`}
          icon={Package}
          color="blue"
          subtitle="Active parcels"
        />
        <SummaryCard
          title="Vehicle Status"
          value={tilted ? 'TILTED' : 'UPRIGHT'}
          icon={Gauge}
          color={tilted ? 'red' : 'green'}
          pulse={tilted}
          subtitle={tilted ? 'Check vehicle' : 'All clear'}
        />
        <SummaryCard
          title="Active Alerts"
          value={alerts.length}
          icon={Bell}
          color={criticalCount > 0 ? 'red' : alerts.length > 0 ? 'amber' : 'blue'}
          pulse={criticalCount > 0}
          subtitle={criticalCount > 0 ? `${criticalCount} critical` : 'Monitor feed'}
        />
      </div>

      {/* Row 2 — Shelf status */}
      <div>
        <h2 className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-3">
          Shelf Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(n => (
            <ShelfCard
              key={n}
              shelfNumber={n}
              data={shelves[`shelf_${n}`]}
            />
          ))}
        </div>
      </div>

      {/* Row 3 — IMU + Alert Feed side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <IMUPanel imu={imu} />
        </div>
        <div className="lg:col-span-2">
          <AlertFeed alerts={alerts} />
        </div>
      </div>

    </div>
  );
}