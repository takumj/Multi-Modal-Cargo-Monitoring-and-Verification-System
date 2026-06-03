import { useEffect, useRef, useState } from 'react';

let alertIdCounter = 0;

// ─── Persistent alert storage ─────────────────────────────────────────────────
const ALERTS_KEY = 'cargotrack_alerts';

function loadStoredAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY)) ?? []; }
  catch { return []; }
}

function persistAlert(alert) {
  const all = loadStoredAlerts();
  all.push({ ...alert, timestamp: alert.timestamp.toISOString() });
  localStorage.setItem(ALERTS_KEY, JSON.stringify(all.slice(-1000))); // keep last 1000
}

export function searchAlerts({ date, from, to }) {
  const all  = loadStoredAlerts();
  const fromTs = new Date(`${date}T${from}:00`).getTime();
  const toTs   = new Date(`${date}T${to}:59`).getTime();
  return all
    .filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= fromTs && t <= toTs;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function clearStoredAlerts() {
  localStorage.removeItem(ALERTS_KEY);
}


// ─── Alert seed for May 22 2026 ───────────────────────────────────────────────
const ALERT_SEED_KEY = 'cargotrack_alert_seed_2026_05_22';

function seedAlertData() {
  if (localStorage.getItem(ALERT_SEED_KEY)) return;

  const mk = (hh, mm, ss) =>
    new Date(`2026-05-22T${hh}:${mm}:${ss}+02:00`).toISOString();

  const seededAlerts = [
    // ── Departure: all shelves confirmed loaded ──────────────────────────
    {
      id: 9001, timestamp: mk('09','00','12'),
      type: 'parcel', shelf: 'shelf_1', severity: 'info',
      message: 'Parcel detected on Shelf 1',
    },
    {
      id: 9002, timestamp: mk('09','00','14'),
      type: 'parcel', shelf: 'shelf_2', severity: 'info',
      message: 'Parcel detected on Shelf 2',
    },
    {
      id: 9003, timestamp: mk('09','00','16'),
      type: 'parcel', shelf: 'shelf_3', severity: 'info',
      message: 'Parcel detected on Shelf 3',
    },

    // ── Julius Nyerere Way — tamper alert ────────────────────────────────
    {
      id: 9004, timestamp: mk('09','12','33'),
      type: 'tamper', shelf: 'shelf_1', severity: 'critical',
      message: '⚠ Tampering on Shelf 1 — latch opened while moving!',
    },

    // ── Herbert Chitepo Avenue — vibration ───────────────────────────────
    {
      id: 9005, timestamp: mk('09','20','38'),
      type: 'vibration', shelf: 'shelf_2', severity: 'critical',
      message: 'Impact detected on Shelf 2',
    },

    // ── Herbert Chitepo Avenue — parcel removed ──────────────────────────
    {
      id: 9006, timestamp: mk('09','23','05'),
      type: 'parcel', shelf: 'shelf_3', severity: 'critical',
      message: '⚠ Parcel removed from Shelf 3 while in transit!',
    },

    // ── Return leg — all shelves emptied ─────────────────────────────────
    {
      id: 9007, timestamp: mk('09','36','05'),
      type: 'parcel', shelf: 'shelf_1', severity: 'warning',
      message: 'Parcel removed from Shelf 1',
    },
    {
      id: 9008, timestamp: mk('09','36','07'),
      type: 'parcel', shelf: 'shelf_2', severity: 'warning',
      message: 'Parcel removed from Shelf 2',
    },
  ];

  const existing = loadStoredAlerts();
  // Avoid duplicating if already partially seeded
  const existingIds = new Set(existing.map(a => a.id));
  const toAdd = seededAlerts.filter(a => !existingIds.has(a.id));
  if (toAdd.length > 0) {
    const merged = [...existing, ...toAdd]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-1000);
    localStorage.setItem(ALERTS_KEY, JSON.stringify(merged));
  }
  localStorage.setItem(ALERT_SEED_KEY, '1');
}

seedAlertData();

// ─── Alert factory ────────────────────────────────────────────────────────────
function makeAlert(type, message, severity, shelf = null) {
  return {
    id:        ++alertIdCounter,
    timestamp: new Date(),
    type,
    message,
    severity,
    shelf,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export default function useAlertFeed(firebaseData) {
  const [alerts, setAlerts] = useState([]);
  const prevRef             = useRef(null);

  useEffect(() => {
    if (!firebaseData) { prevRef.current = firebaseData; return; }

    const prev = prevRef.current;
    prevRef.current = firebaseData;
    if (!prev) return;

    const newAlerts = [];
    const speed  = firebaseData.vehicle?.gps?.speed_kmh ?? 0;
    const moving = speed > 2;

    // ── Shelf events ───────────────────────────────────────────────────────
    ['shelf_1', 'shelf_2', 'shelf_3'].forEach((id, i) => {
      const p = prev.shelves?.[id];
      const c = firebaseData.shelves?.[id];
      if (!p || !c) return;
      const n = i + 1;

      // Parcel presence
      if (p.parcel_present !== c.parcel_present) {
        if (c.parcel_present) {
          newAlerts.push(makeAlert('parcel', `Parcel detected on Shelf ${n}`, 'info', id));
        } else {
          newAlerts.push(makeAlert('parcel',
            moving ? `⚠ Parcel removed from Shelf ${n} while in transit!` : `Parcel removed from Shelf ${n}`,
            moving ? 'critical' : 'warning', id));
        }
      }

      // Vibration
      if (!p.vibration && c.vibration) {
        newAlerts.push(makeAlert('vibration',
          `Impact detected on Shelf ${n}`,
          moving ? 'critical' : 'warning', id));
      }

      // Reed switch — supports both field names
      const prevOpen = p.container_open ?? (p.reed_switch && p.reed_switch !== 'CLOSED');
      const currOpen = c.container_open ?? (c.reed_switch && c.reed_switch !== 'CLOSED');

      if (!prevOpen && currOpen) {
        newAlerts.push(makeAlert('tamper',
          moving ? `⚠ Tampering on Shelf ${n} — latch opened while moving!` : `Container opened on Shelf ${n}`,
          moving ? 'critical' : 'info', id));
      }
      if (prevOpen && !currOpen) {
        newAlerts.push(makeAlert('container', `Container closed on Shelf ${n}`, 'success', id));
      }

    });

    // ── Vehicle tilt ───────────────────────────────────────────────────────
    const prevTilted = prev.vehicle?.imu?.tilted;
    const currTilted = firebaseData.vehicle?.imu?.tilted;
    if (!prevTilted && currTilted) {
      const angle = firebaseData.vehicle?.imu?.tilt_angle?.toFixed(1) ?? '?';
      newAlerts.push(makeAlert('tilt', `Vehicle tilt detected! Angle: ${angle}°`, 'critical'));
    }
    if (prevTilted && !currTilted) {
      newAlerts.push(makeAlert('tilt', 'Vehicle returned to upright', 'success'));
    }

    // ── GPS signal ─────────────────────────────────────────────────────────
    const prevGPS = prev.vehicle?.gps?.valid;
    const currGPS = firebaseData.vehicle?.gps?.valid;
    if (!prevGPS && currGPS) {
      newAlerts.push(makeAlert('gps', 'GPS signal acquired', 'success'));
    }
    if (prevGPS && !currGPS) {
      newAlerts.push(makeAlert('gps', 'GPS signal lost', 'critical'));
    }

    if (newAlerts.length > 0) {
      // Persist each alert to localStorage
      newAlerts.forEach(persistAlert);
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
    }
  }, [firebaseData]);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  return { alerts, criticalCount };
}