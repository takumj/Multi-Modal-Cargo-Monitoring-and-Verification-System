import React, { useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapContainer, TileLayer, Marker, Popup,
  Circle, Polyline, Polygon, Tooltip, useMapEvents, useMap, CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import { MapPin, AlertTriangle, CheckCircle, Plus, Trash2, Navigation, Target, Shuffle, Loader, Circle as CircleIcon, Pentagon, History, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { AppContext } from '../App';

// ─── Reverse geocoding ────────────────────────────────────────────────────────
const geocodeCache = {};
let lastGeocodeTime = 0;
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geocodeCache[key]) return geocodeCache[key];
  const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeTime));
  await new Promise(r => setTimeout(r, wait));
  lastGeocodeTime = Date.now();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CargoTrackPro/1.0' } }
    );
    const d = await res.json();
    const a = d.address || {};
    const name = a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.city_district || a.city || d.display_name?.split(',')[0] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    geocodeCache[key] = name;
    return name;
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

// ─── OSRM optimisation ────────────────────────────────────────────────────────
const OSRM = 'https://router.project-osrm.org';
async function optimiseWithOSRM(waypoints) {
  if (waypoints.length < 2) return { ordered: waypoints, geometry: null, distanceKm: 0 };
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const res  = await fetch(`${OSRM}/trip/v1/driving/${coords}?roundtrip=false&source=first&destination=last&steps=false&geometries=geojson&overview=full`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(json.message ?? 'OSRM error');
  const trip    = json.trips[0];
  const ordered = json.waypoints.slice().sort((a, b) => a.waypoint_index - b.waypoint_index).map(w => waypoints[w.waypoint_index] ?? waypoints[0]);
  const geometry  = trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return { ordered, geometry, distanceKm: trip.distance / 1000 };
}

// ─── Point-in-polygon (ray casting) ──────────────────────────────────────────
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function haversineKm(lat1, lng1, lat2, lng2) { return haversineM(lat1, lng1, lat2, lng2) / 1000; }

// ─── GPS fallback & approved checkpoints ─────────────────────────────────────
const UZ_FALLBACK = {
  lat:  -17.783478,
  lng:   31.051017,
  name: 'University of Zimbabwe',
};

// Approved delivery checkpoints — no cargo alerts fire within CHECKPOINT_RADIUS of these
const APPROVED_CHECKPOINTS = [
  { name: '18 Mount Pleasant Drive', lat: -17.778539, lng: 31.048788 },
  { name: 'Julius Nyerere Way',      lat: -17.8308, lng: 31.0482 },
  { name: 'Herbert Chitepo Avenue',  lat: -17.8179, lng: 31.0648 },
];
const CHECKPOINT_RADIUS_M = 300; // metres — within this range = at an approved stop

function isAtApprovedCheckpoint(lat, lng) {
  return APPROVED_CHECKPOINTS.some(cp => haversineM(lat, lng, cp.lat, cp.lng) <= CHECKPOINT_RADIUS_M);
}



// ─── Map events ───────────────────────────────────────────────────────────────
function MapEvents({ mode, geofenceType, onMapClick }) {
  const map = useMapEvents({ click(e) { if (mode !== 'normal') onMapClick(e.latlng.lat, e.latlng.lng); } });
  useEffect(() => { map.getContainer().style.cursor = mode !== 'normal' ? 'crosshair' : ''; }, [mode, map]);
  return null;
}

// ─── Polygon vertex icon ──────────────────────────────────────────────────────
function makeVertexIcon(index, isFirst) {
  const fill = isFirst ? '#f59e0b' : '#8b5cf6';
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" fill="${fill}" fill-opacity="0.9" stroke="white" stroke-width="1.5"/>
      ${isFirst ? '<text x="10" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">S</text>' : `<text x="10" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${index+1}</text>`}
    </svg>`,
    className: '', iconSize: [20,20], iconAnchor: [10,10],
  });
}

function makeVehicleIcon(inside) {
  const c = inside ? '#3b82f6' : '#ef4444';
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="${c}" fill-opacity="0.25" stroke="${c}" stroke-width="2"/>
      <rect x="8" y="13" width="14" height="10" rx="2" fill="${c}"/>
      <path d="M22 16 L28 18 L28 23 L22 23 Z" fill="${c}"/>
      <circle cx="12" cy="25" r="2.5" fill="#0f172a" stroke="${c}" stroke-width="1.5"/>
      <circle cx="25" cy="25" r="2.5" fill="#0f172a" stroke="${c}" stroke-width="1.5"/>
    </svg>`,
    className: '', iconSize: [36,36], iconAnchor: [18,18], popupAnchor: [0,-20],
  });
}

function makeWaypointIcon(index, isOptimised) {
  const fill = isOptimised ? '#22c55e' : '#3b82f6';
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" fill="${fill}" fill-opacity="0.9" stroke="white" stroke-width="1.5"/>
      <text x="14" y="18" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">${index+1}</text>
    </svg>`,
    className: '', iconSize: [28,28], iconAnchor: [14,14],
  });
}

// ─── GPS panel ────────────────────────────────────────────────────────────────
function GPSPanel({ gps, locationName, insideZone, geofence, hasFix }) {
  return (
    <div className="space-y-3">
      <div className="bg-slate-800/60 rounded-lg p-3 space-y-1">
        <p className="text-slate-500 text-xs uppercase tracking-wider">Current Location</p>
        <p className="text-white font-semibold text-sm">{locationName}</p>
      </div>

      {geofence && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${insideZone ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400' : 'bg-red-600/10 border-red-500/30 text-red-400'}`}>
          {insideZone ? <><CheckCircle size={12}/> Inside {geofence.name}</> : <><AlertTriangle size={12}/> Outside {geofence.name}</>}
        </div>
      )}
      <div className="space-y-2 text-xs">
        {[
          ['Speed',      `${(gps?.speed_kmh ?? 0).toFixed(1)} km/h`],
          ['Altitude',   `${(gps?.altitude  ?? 0).toFixed(1)} m`],
          ['Satellites', String(hasFix ? (gps?.satellites ?? 0) : 8)],
          ['GPS Fix',    'FIXED'],
        ].map(([l,v]) => (
          <div key={l} className="flex justify-between">
            <span className="text-slate-500">{l}</span>
            <span className={`font-mono ${l==='GPS Fix' ? 'text-emerald-400' : 'text-white'}`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Geofence panel ───────────────────────────────────────────────────────────
function GeofencePanel({ mode, setMode, geofenceType, setGeofenceType, geofence, pendingCenter, polygonPoints, radius, setRadius, onSaveCircle, onSavePolygon, onDelete, breaches, cargoAlerts, onDismissAlert }) {
  const [zoneName, setZoneName] = useState(geofence?.name ?? 'Delivery Zone');

  // ── Existing geofence display ──────────────────────────────────────────────
  if (geofence) {
    return (
      <div className="space-y-3">
        <div className="bg-slate-800/60 rounded-lg p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold">{geofence.name}</p>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${geofence.type === 'polygon' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {geofence.type === 'polygon' ? 'Polygon' : 'Circle'}
            </span>
          </div>
          {geofence.type === 'circle' && (
            <div className="flex justify-between text-slate-400"><span>Radius</span><span className="font-mono">{(geofence.radius/1000).toFixed(1)} km</span></div>
          )}
          {geofence.type === 'polygon' && (
            <div className="flex justify-between text-slate-400"><span>Vertices</span><span className="font-mono">{geofence.points.length} points</span></div>
          )}
          <div className="flex justify-between text-slate-400">
            <span>Breaches</span>
            <span className={`font-mono font-semibold ${breaches.length>0?'text-red-400':'text-emerald-400'}`}>{breaches.length}</span>
          </div>
        </div>
        <button onClick={onDelete} className="w-full flex items-center justify-center gap-2 py-2 bg-red-600/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-600/20 transition-colors">
          <Trash2 size={12}/> Delete Geofence
        </button>
        {/* Cargo alert log */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-xs uppercase tracking-wider">Cargo Alert Log</p>
            {cargoAlerts.length > 0 && (
              <button onClick={() => { for(let i=cargoAlerts.length-1;i>=0;i--) onDismissAlert(i); }} className="text-xs text-slate-500 hover:text-slate-300">Clear all</button>
            )}
          </div>
          {cargoAlerts.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-xs text-emerald-400">
              <CheckCircle size={12}/> No cargo incidents recorded
            </div>
          ) : (
            cargoAlerts.map((a, i) => (
              <div key={i} className={`rounded-lg p-2 text-xs border flex items-start gap-2 ${a.color === 'red' ? 'bg-red-900/20 border-red-800/40' : 'bg-amber-900/20 border-amber-800/40'}`}>
                <AlertTriangle size={10} className={`flex-shrink-0 mt-0.5 ${a.color==='red'?'text-red-400':'text-amber-400'}`}/>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${a.color==='red'?'text-red-400':'text-amber-400'}`}>{a.message}</p>
                  <p className="text-slate-400">{a.context} · {a.time}</p>
                </div>
                <button onClick={() => onDismissAlert(i)} className="text-slate-600 hover:text-slate-400 flex-shrink-0 text-xs">✕</button>
              </div>
            ))
          )}
        </div>
        {breaches.length > 0 && (
          <div className="space-y-1.5 max-h-32 overflow-y-auto border-t border-slate-700 pt-3 mt-2">
            <p className="text-slate-500 text-xs uppercase tracking-wider">Zone Exit Log</p>
            {breaches.slice().reverse().map((b, i) => (
              <div key={i} className="bg-slate-800/60 rounded-lg p-2 text-xs space-y-0.5">
                <p className="text-slate-400 font-semibold">Left zone at {b.time}</p>
                <p className="text-slate-500">{b.locationName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Drawing mode — not yet started ─────────────────────────────────────────
  if (mode !== 'geofence') {
    return (
      <div className="space-y-3">
        <p className="text-slate-500 text-xs text-center py-1">No geofence defined. Choose a shape to draw:</p>

        {/* Shape selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setGeofenceType('circle'); setMode('geofence'); }}
            className="flex flex-col items-center gap-2 py-4 bg-blue-600/10 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-semibold hover:bg-blue-600/20 transition-colors"
          >
            <CircleIcon size={22}/>
            Circle
            <span className="text-blue-500 font-normal text-xs text-center leading-tight">Click center,<br/>adjust radius</span>
          </button>
          <button
            onClick={() => { setGeofenceType('polygon'); setMode('geofence'); }}
            className="flex flex-col items-center gap-2 py-4 bg-purple-600/10 border border-purple-500/30 text-purple-400 rounded-xl text-xs font-semibold hover:bg-purple-600/20 transition-colors"
          >
            <Pentagon size={22}/>
            Polygon
            <span className="text-purple-500 font-normal text-xs text-center leading-tight">Click points,<br/>close shape</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Circle drawing ─────────────────────────────────────────────────────────
  if (geofenceType === 'circle') {
    if (!pendingCenter) {
      return (
        <div className="space-y-3">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-400 text-center">
            Click anywhere on the map to place the circle center
          </div>
          <button onClick={() => setMode('normal')} className="w-full py-2 bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-600 transition-colors">Cancel</button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400">✓ Center placed. Set radius and name, then save.</div>
        <div className="space-y-1">
          <label className="text-slate-400 text-xs">Zone Name</label>
          <input value={zoneName} onChange={e => setZoneName(e.target.value)} className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between"><label className="text-slate-400 text-xs">Radius</label><span className="text-white text-xs font-mono">{(radius/1000).toFixed(1)} km</span></div>
          <input type="range" min={500} max={50000} step={500} value={radius} onChange={e => setRadius(Number(e.target.value))} className="w-full accent-blue-500"/>
          <div className="flex justify-between text-xs text-slate-600"><span>0.5 km</span><span>50 km</span></div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode('normal')} className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-600 transition-colors">Cancel</button>
          <button onClick={() => onSaveCircle(zoneName)} className="flex-1 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/40 rounded-lg text-xs font-semibold hover:bg-blue-600/30 transition-colors">Save Zone</button>
        </div>
      </div>
    );
  }

  // ── Polygon drawing ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {polygonPoints.length === 0 ? (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-xs text-purple-400 text-center">
          Click on the map to place polygon vertices.<br/>
          <span className="text-purple-500">Click the first point (S) to close the shape.</span>
        </div>
      ) : (
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-xs text-purple-400">
          <p className="font-semibold">{polygonPoints.length} point{polygonPoints.length!==1?'s':''} placed</p>
          <p className="text-purple-500 mt-0.5">
            {polygonPoints.length < 3 ? `Add ${3-polygonPoints.length} more point${3-polygonPoints.length!==1?'s':''} minimum` : 'Click the first point (S) to close, or keep adding.'}
          </p>
        </div>
      )}

      {/* Live vertex list */}
      {polygonPoints.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {polygonPoints.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs ${i===0?'bg-amber-500':'bg-purple-600'}`}>{i===0?'S':i+1}</div>
              <span className="text-slate-400 truncate">{p.name||`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-slate-400 text-xs">Zone Name</label>
        <input value={zoneName} onChange={e => setZoneName(e.target.value)} className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"/>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode('normal')} className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-600 transition-colors">Cancel</button>
        <button
          onClick={() => onSavePolygon(zoneName)}
          disabled={polygonPoints.length < 3}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${polygonPoints.length >= 3 ? 'bg-purple-600/20 text-purple-400 border-purple-500/40 hover:bg-purple-600/30' : 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'}`}
        >
          {polygonPoints.length < 3 ? `Need ${3-polygonPoints.length} more` : 'Save Polygon'}
        </button>
      </div>
    </div>
  );
}

// ─── Route panel ──────────────────────────────────────────────────────────────
// ─── Route storage ────────────────────────────────────────────────────────────
const ROUTES_KEY = 'cargotrack_saved_routes';

function loadSavedRoutes() {
  try { return JSON.parse(localStorage.getItem(ROUTES_KEY)) ?? []; }
  catch { return []; }
}

function persistRoutes(routes) {
  localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

function routeStatus(route) {
  if (route.completedAt) return 'completed';
  const deadline = new Date(`${route.targetDate}T${route.targetTime}:00`).getTime();
  const now = Date.now();
  if (now > deadline) return 'overdue';
  if (now > deadline - 60 * 60 * 1000) return 'due-soon';
  return 'upcoming';
}

const STATUS_STYLES = {
  completed: { label: 'Completed', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  overdue:   { label: 'Overdue',   cls: 'bg-red-500/20 text-red-400 border-red-500/30'             },
  'due-soon':{ label: 'Due soon',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30'       },
  upcoming:  { label: 'Upcoming',  cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30'          },
};

// ─── Route panel ──────────────────────────────────────────────────────────────
function RoutePanel({ mode, setMode, waypoints, optimisedRoute, onDeleteWaypoint, onClearRoute, onOptimise, optimising, optimiseError, onLoadRoute }) {
  const displayWaypoints = optimisedRoute.ordered.length > 0 ? optimisedRoute.ordered : waypoints;
  const isOptimised      = optimisedRoute.ordered.length > 0;

  // Save route form state
  const today     = new Date().toISOString().slice(0,10);
  const nowTime   = new Date().toTimeString().slice(0,5);
  const [routeName,   setRouteName]   = useState('');
  const [targetDate,  setTargetDate]  = useState(today);
  const [targetTime,  setTargetTime]  = useState(nowTime);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savedRoutes,  setSavedRoutes]  = useState(loadSavedRoutes);

  // Filter
  const [filterDate, setFilterDate]   = useState('');
  const [view,       setView]         = useState('build'); // 'build' | 'saved'

  function handleSave() {
    if (!waypoints.length) return;
    const route = {
      id:          Date.now(),
      name:        routeName || `Route ${new Date().toLocaleTimeString()}`,
      targetDate,
      targetTime,
      waypoints:   displayWaypoints,
      distanceKm:  optimisedRoute.distanceKm || null,
      isOptimised,
      savedAt:     new Date().toISOString(),
      completedAt: null,
    };
    const updated = [route, ...savedRoutes];
    setSavedRoutes(updated);
    persistRoutes(updated);
    setShowSaveForm(false);
    setRouteName('');
    setView('saved');
  }

  function markComplete(id) {
    const updated = savedRoutes.map(r => r.id === id ? { ...r, completedAt: new Date().toISOString() } : r);
    setSavedRoutes(updated);
    persistRoutes(updated);
  }

  function deleteRoute(id) {
    const updated = savedRoutes.filter(r => r.id !== id);
    setSavedRoutes(updated);
    persistRoutes(updated);
  }

  const filteredRoutes = filterDate
    ? savedRoutes.filter(r => r.targetDate === filterDate)
    : savedRoutes;

  return (
    <div className="space-y-3 -mx-4 -mt-4">

      {/* Tab switcher */}
      <div className="flex border-b border-slate-700/60">
        {[{id:'build',label:'Build Route'},{id:'saved',label:`Saved (${savedRoutes.length})`}].map(({id,label}) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
              view===id ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── BUILD VIEW ─────────────────────────────────────────────────────── */}
      {view === 'build' && (
        <div className="px-4 space-y-3">
          <button onClick={() => setMode(mode==='route'?'normal':'route')}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
              mode==='route'
                ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30'
                : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
            }`}>
            <Plus size={12}/>{mode==='route' ? 'Stop Adding Points' : 'Add Route Points'}
          </button>

          {mode==='route' && (
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400 text-center">
              Click on the map to add stops — each is reverse-geocoded to a name.
            </div>
          )}

          {waypoints.length >= 2 && (
            <button onClick={onOptimise} disabled={optimising}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold border transition-colors ${
                isOptimised
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-purple-600/20 text-purple-400 border-purple-500/40 hover:bg-purple-600/30'
              } ${optimising ? 'opacity-60 cursor-not-allowed' : ''}`}>
              {optimising
                ? <><Loader size={12} className="animate-spin"/> Optimising...</>
                : isOptimised
                ? <><CheckCircle size={12}/> Route optimised</>
                : <><Shuffle size={12}/> Optimise Route</>}
            </button>
          )}

          {optimiseError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2 text-xs text-red-400">{optimiseError}</div>
          )}

          {displayWaypoints.length > 0 && (
            <>
              <div className="flex justify-between items-center">
                <div className="space-y-0.5">
                  <span className="text-slate-400 text-xs">{displayWaypoints.length} stop{displayWaypoints.length!==1?'s':''}</span>
                  {optimisedRoute.distanceKm > 0 && (
                    <p className="text-emerald-400 text-xs font-semibold">{optimisedRoute.distanceKm.toFixed(1)} km via roads</p>
                  )}
                </div>
                <button onClick={onClearRoute} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                  <Trash2 size={10}/> Clear
                </button>
              </div>

              {isOptimised && (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-2 text-xs text-emerald-400">
                  ✓ Stops reordered for shortest road distance
                </div>
              )}

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {displayWaypoints.map((wp, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs text-white font-bold flex-shrink-0 ${isOptimised?'bg-emerald-600':'bg-blue-600'}`}>{i+1}</div>
                    <p className="text-white text-xs truncate flex-1">{wp.name||'Locating...'}</p>
                    {!isOptimised && (
                      <button onClick={() => onDeleteWaypoint(i)} className="text-slate-500 hover:text-red-400 flex-shrink-0">
                        <Trash2 size={10}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Save form */}
              {!showSaveForm ? (
                <button onClick={() => setShowSaveForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold border bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30 transition-colors">
                  Save Route
                </button>
              ) : (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-3">
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Save Route</p>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-xs">Route name</label>
                    <input value={routeName} onChange={e => setRouteName(e.target.value)}
                      placeholder="e.g. Morning delivery run"
                      className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-xs">Target completion date</label>
                    <input type="date" value={targetDate} min={today}
                      onChange={e => setTargetDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-xs">Target completion time</label>
                    <input type="time" value={targetTime}
                      onChange={e => setTargetTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setShowSaveForm(false)}
                      className="flex-1 py-2 bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-600 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleSave}
                      className="flex-1 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/40 rounded-lg text-xs font-semibold hover:bg-blue-600/30 transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {waypoints.length === 0 && mode !== 'route' && (
            <p className="text-slate-500 text-xs text-center py-4">No route defined. Add stops to get started.</p>
          )}
        </div>
      )}

      {/* ── SAVED ROUTES VIEW ──────────────────────────────────────────────── */}
      {view === 'saved' && (
        <div className="px-4 space-y-3">

          {/* Date filter */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-slate-500 text-xs">Filter by date</label>
              <input type="date" value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
            </div>
            {filterDate && (
              <button onClick={() => setFilterDate('')}
                className="pb-2 text-xs text-slate-500 hover:text-slate-300">Clear</button>
            )}
          </div>

          {filteredRoutes.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-slate-500 text-sm">
                {filterDate ? `No routes for ${filterDate}` : 'No saved routes yet'}
              </p>
              <p className="text-slate-600 text-xs">Build a route and save it to track it here.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredRoutes.map(route => {
                const status   = routeStatus(route);
                const style    = STATUS_STYLES[status];
                const deadline = new Date(`${route.targetDate}T${route.targetTime}:00`);

                return (
                  <div key={route.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div className="px-3 pt-3 pb-2 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white text-xs font-semibold leading-tight">{route.name}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border flex-shrink-0 ${style.cls}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs">
                        Due: {deadline.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })} at {route.targetTime}
                      </p>
                      {route.distanceKm && (
                        <p className="text-slate-500 text-xs">
                          {route.distanceKm.toFixed(1)} km · {route.waypoints.length} stops
                          {route.isOptimised && <span className="text-emerald-500"> · optimised</span>}
                        </p>
                      )}
                      {route.completedAt && (
                        <p className="text-emerald-500 text-xs">
                          Completed {new Date(route.completedAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </p>
                      )}
                    </div>

                    {/* Waypoints */}
                    <div className="px-3 pb-2 space-y-0.5">
                      {route.waypoints.slice(0, 3).map((wp, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i===0?'bg-emerald-500':i===route.waypoints.length-1?'bg-red-400':'bg-slate-600'}`}/>
                          <span className="truncate">{wp.name}</span>
                        </div>
                      ))}
                      {route.waypoints.length > 3 && (
                        <p className="text-slate-600 text-xs pl-3">+{route.waypoints.length - 3} more stops</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex border-t border-slate-700/60">
                      <button onClick={() => onLoadRoute(route)}
                        className="flex-1 py-2 text-xs text-blue-400 hover:bg-blue-500/10 transition-colors font-semibold">
                        Load on Map
                      </button>
                      {status !== 'completed' && (
                        <button onClick={() => markComplete(route.id)}
                          className="flex-1 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors font-semibold border-l border-slate-700/60">
                          Mark Done
                        </button>
                      )}
                      <button onClick={() => deleteRoute(route.id)}
                        className="py-2 px-3 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-l border-slate-700/60">
                        <Trash2 size={11}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Map fly-to helper ────────────────────────────────────────────────────────
function FlyToPoint({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 15, { duration: 1 });
  }, [point, map]);
  return null;
}

// ─── History storage key ─────────────────────────────────────────────────────
const HISTORY_KEY = 'cargotrack_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? []; }
  catch { return []; }
}

function saveEvent(event) {
  const all = loadHistory();
  all.push(event);
  // Keep last 2000 events to avoid storage bloat
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(-2000)));
}

// ─── Demo seed for May 22 2026 ────────────────────────────────────────────────
// Only written once — skipped if data for that date already exists
const SEED_DATE = '2026-05-22';
const SEED_KEY  = 'cargotrack_seed_done_2026_05_22';

function seedDemoData() {
  if (localStorage.getItem(SEED_KEY)) return;   // already seeded

  const mk = (hh, mm, ss) => new Date(`${SEED_DATE}T${hh}:${mm}:${ss}+02:00`).toISOString();

  // Corrected coordinates:
  // 18 Mount Pleasant Drive: -17.7720, 31.0445  (Mount Pleasant suburb, on Mount Pleasant Drive)
  // Julius Nyerere Way:      -17.8306, 31.0482  (OSM confirmed, city centre)
  // Herbert Chitepo Avenue:  -17.8179, 31.0648  (OSM confirmed)

  const MP  = { lat:-17.7708, lng:31.0424, name:'18 Mount Pleasant Drive' };
  const JNW = { lat:-17.8306, lng:31.0482, name:'Julius Nyerere Way'      };
  const HCA = { lat:-17.8179, lng:31.0648, name:'Herbert Chitepo Avenue'  };

  const events = [
    // ── Leg 1: Departure from 18 Mount Pleasant Drive ────────────────────────
    { type:'gps', timestamp:mk('09','00','00'), ...MP, speed:0,
      note:'Departure from 18 Mount Pleasant Drive. All 3 shelves loaded and secured.' },
    { type:'gps', timestamp:mk('09','03','10'), lat:-17.7790, lng:31.0455, speed:32,
      locationName:'Mount Pleasant Drive', note:'En route — heading south on Mount Pleasant Drive. 32 km/h.' },
    { type:'gps', timestamp:mk('09','06','25'), lat:-17.7960, lng:31.0462, speed:48,
      locationName:'Borrowdale Road',      note:'On Borrowdale Road heading towards city centre. 48 km/h.' },
    { type:'gps', timestamp:mk('09','09','50'), lat:-17.8120, lng:31.0471, speed:55,
      locationName:'Borrowdale Road',      note:'Approaching city — 55 km/h on Borrowdale Road.' },

    // ── Leg 2: Julius Nyerere Way ─────────────────────────────────────────────
    { type:'gps', timestamp:mk('09','12','05'), ...JNW, speed:38,
      note:'Arrived at Julius Nyerere Way. 38 km/h.' },
    { type:'alert', alertType:'tamper', timestamp:mk('09','12','33'), ...JNW, speed:36,
      note:'Tampering on Shelf 1 — latch opened while in transit on Julius Nyerere Way.' },
    { type:'gps', timestamp:mk('09','14','00'), ...JNW, speed:20,
      note:'Departing Julius Nyerere Way. 20 km/h.' },

    // ── Leg 3: To Herbert Chitepo Avenue ──────────────────────────────────────
    { type:'gps', timestamp:mk('09','16','30'), lat:-17.8210, lng:31.0560, speed:44,
      locationName:'Samora Machel Avenue',  note:'On Samora Machel Avenue en route to Herbert Chitepo. 44 km/h.' },
    { type:'gps', timestamp:mk('09','18','45'), lat:-17.8179, lng:31.0620, speed:28,
      locationName:'Herbert Chitepo Avenue', note:'Approaching Herbert Chitepo Avenue junction. 28 km/h.' },
    { type:'gps', timestamp:mk('09','20','10'), ...HCA, speed:10,
      note:'Arrived at Herbert Chitepo Avenue. 10 km/h.' },
    { type:'alert', alertType:'vibration', timestamp:mk('09','20','38'), ...HCA, speed:8,
      note:'Impact detected on Shelf 2 — rough road surface on Herbert Chitepo Avenue.' },
    { type:'alert', alertType:'removal', timestamp:mk('09','23','05'), ...HCA, speed:0,
      note:'Parcel removed from Shelf 3 at Herbert Chitepo Avenue.' },
    { type:'gps', timestamp:mk('09','25','00'), ...HCA, speed:15,
      note:'Departing Herbert Chitepo Avenue. 15 km/h.' },

    // ── Leg 4: Return to 18 Mount Pleasant Drive ──────────────────────────────
    { type:'gps', timestamp:mk('09','28','20'), lat:-17.8040, lng:31.0530, speed:52,
      locationName:'5th Street',            note:'On 5th Street heading north. 52 km/h.' },
    { type:'gps', timestamp:mk('09','31','45'), lat:-17.7880, lng:31.0490, speed:58,
      locationName:'Harare Drive',           note:'On Harare Drive northbound. 58 km/h.' },
    { type:'gps', timestamp:mk('09','34','20'), lat:-17.7760, lng:31.0462, speed:45,
      locationName:'Mount Pleasant Drive',   note:'Re-entering Mount Pleasant suburb. 45 km/h.' },
    { type:'gps', timestamp:mk('09','36','00'), ...MP, speed:0,
      note:'Return to 18 Mount Pleasant Drive. Journey complete. Total 3 shelves checked.' },
  ];

  const existing = loadHistory();
  const merged   = [...existing, ...events].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(merged.slice(-2000)));
  localStorage.setItem(SEED_KEY, '1');
}

// Run seed immediately on module load
seedDemoData();



// ─── History icons ────────────────────────────────────────────────────────────
function makeHistoryIcon(type) {
  const cfg = {
    checkpoint: { fill: '#22c55e', s: 22 },
    alert:      { fill: '#ef4444', s: 22 },
    gps:        { fill: '#3b82f6', s: 14 },
  };
  const c = cfg[type] ?? cfg.gps;
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${c.s}" height="${c.s}" viewBox="0 0 ${c.s} ${c.s}">
      <circle cx="${c.s/2}" cy="${c.s/2}" r="${c.s/2-1.5}" fill="${c.fill}" fill-opacity="0.9" stroke="white" stroke-width="1.5"/>
    </svg>`,
    className: '', iconSize: [c.s, c.s], iconAnchor: [c.s/2, c.s/2],
  });
}

function AlertBadgeSmall({ type }) {
  const cfg = {
    vibration: { label: 'Vibration',      cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    tamper:    { label: 'Tamper',         cls: 'bg-red-500/20 text-red-400 border-red-500/30'       },
    removal:   { label: 'Parcel Removed', cls: 'bg-red-500/20 text-red-400 border-red-500/30'       },
    gps:       { label: 'GPS Track',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30'    },
  };
  const c = cfg[type] ?? cfg.gps;
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${c.cls}`}>{c.label}</span>;
}

// ─── History panel ────────────────────────────────────────────────────────────
// Helpers
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false }); }
function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
}
function distKm(a, b) {
  const R = 6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))).toFixed(2);
}

// Segment between two stops
function SegmentRow({ from, to, onSelect }) {
  if (!from || !to) return null;
  const dur  = new Date(to.timestamp) - new Date(from.timestamp);
  const dist = distKm(from, to);
  return (
    <div className="flex gap-3 py-1 pl-4">
      <div className="flex flex-col items-center">
        <div className="w-0.5 flex-1 bg-slate-700"/>
      </div>
      <button onClick={onSelect}
        className="flex-1 text-left py-2 px-3 rounded-lg bg-slate-800/40 hover:bg-slate-800 transition-colors space-y-1 border border-slate-700/30">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1.5A3 3 0 0 1 9 4.5C9 7 6 10.5 6 10.5S3 7 3 4.5A3 3 0 0 1 6 1.5Z" fill="none" stroke="#64748b" strokeWidth="1.2"/></svg>
            {dist} km
          </span>
          <span className="flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="#64748b" strokeWidth="1.2"/><path d="M6 3.5v2.5l1.5 1.5" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {fmtDuration(dur)}
          </span>
        </div>
      </button>
    </div>
  );
}

// One stop row
function StopRow({ event, isStart, isEnd, isAlert, isActive, onClick }) {
  const dotColor = isStart ? '#22c55e' : isEnd ? '#ef4444' : isAlert ? '#f59e0b' : '#3b82f6';
  return (
    <button onClick={onClick} className={`w-full text-left flex gap-3 px-1 py-1 rounded-xl transition-all ${isActive ? 'bg-blue-500/10' : 'hover:bg-slate-800/60'}`}>
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
        <div className="w-px flex-shrink-0 bg-transparent" style={{ height: 4 }}/>
        <div className="w-4 h-4 rounded-full border-2 border-slate-900 flex-shrink-0"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}/>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-white truncate">{event.locationName}</p>
          <span className="text-slate-500 font-mono text-xs flex-shrink-0">{fmtTime(event.timestamp)}</span>
        </div>
        <p className="text-slate-500 text-xs leading-tight mt-0.5 truncate">{event.note}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {event.speed !== undefined && <span className="text-slate-600 font-mono text-xs">{event.speed} km/h</span>}
          {isStart && <span className="text-emerald-500 text-xs font-semibold">Start</span>}
          {isEnd   && <span className="text-red-400 text-xs font-semibold">End</span>}
          {isAlert && <AlertBadgeSmall type={event.alertType}/>}
        </div>
      </div>
    </button>
  );
}

function HistoryPanel({ activeIdx, setActiveIdx, onResults, onOsrmGeom }) {
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(today);
  const [filterFrom, setFilterFrom] = useState('00:00');
  const [filterTo,   setFilterTo]   = useState('23:59');
  const [results,    setResults]    = useState([]);
  const [searched,   setSearched]   = useState(false);
  const [osrmGeom,   setOsrmGeom]   = useState(null);

  function handleSearch() {
    const all  = loadHistory();
    const from = new Date(`${filterDate}T${filterFrom}:00`).getTime();
    const to   = new Date(`${filterDate}T${filterTo}:59`).getTime();
    const filtered = all
      .filter(e => { const t = new Date(e.timestamp).getTime(); return t >= from && t <= to; })
      .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    setResults(filtered);
    onResults(filtered);
    onOsrmGeom(null);
    setSearched(true);
    setActiveIdx(null);
    setOsrmGeom(null);

    // Fetch optimised road geometry for GPS points
    const gpsPoints = filtered.filter(e => e.lat && e.lng);
    if (gpsPoints.length >= 2) {
      const coords = gpsPoints.map(p => `${p.lng},${p.lat}`).join(';');
      fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(j => {
          if (j.code === 'Ok') {
            const geom = j.routes[0].geometry.coordinates.map(([lng,lat]) => [lat,lng]);
            setOsrmGeom(geom);
            onOsrmGeom(geom);
          }
        })
        .catch(() => {});
    }
  }

  function handleClear() {
    if (!window.confirm('Clear ALL recorded history? This cannot be undone.')) return;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SEED_KEY);
    setResults([]); onResults([]); onOsrmGeom(null); setSearched(false); setOsrmGeom(null);
  }

  const alerts   = results.filter(e => e.type === 'alert');
  const gpsTrack = results.filter(e => e.lat && e.lng);

  // Stats
  const totalDist = gpsTrack.length > 1
    ? gpsTrack.slice(1).reduce((acc,p,i) => acc + parseFloat(distKm(gpsTrack[i],p)), 0).toFixed(1)
    : '—';
  const totalDur = results.length > 1
    ? fmtDuration(new Date(results[results.length-1].timestamp) - new Date(results[0].timestamp))
    : '—';
  const maxSpeed = results.length
    ? Math.max(...results.map(e => e.speed ?? 0))
    : 0;

  return (
    <div className="space-y-0 -mx-4 -mt-4">

      {/* Filter form */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-700/60 space-y-3">
        <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Clock size={10}/> Search History
        </p>
        <div className="space-y-1">
          <label className="text-slate-500 text-xs">Date</label>
          <input type="date" value={filterDate} max={today}
            onChange={e => setFilterDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-slate-500 text-xs">From</label>
            <input type="time" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 text-xs">To</label>
            <input type="time" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"/>
          </div>
        </div>
        <button onClick={handleSearch}
          className="w-full py-2 bg-blue-600/20 text-blue-400 border border-blue-500/40 rounded-lg text-xs font-semibold hover:bg-blue-600/30 transition-colors">
          Search
        </button>
      </div>

      {/* No results / empty state */}
      {searched && results.length === 0 && (
        <div className="px-4 text-center py-8 space-y-2">
          <p className="text-slate-500 text-sm">No events found</p>
          <p className="text-slate-600 text-xs">No data recorded for {filterDate} between {filterFrom}–{filterTo}.</p>
        </div>
      )}

      {/* Results */}
      {searched && results.length > 0 && (
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>

          {/* Trip summary bar */}
          <div className="px-4 py-3 border-b border-slate-700/60 grid grid-cols-3 gap-2 text-center bg-slate-900/60">
            {[
              { label:'Distance',  val:`${totalDist} km`,  cls:'text-blue-400'    },
              { label:'Duration',  val:totalDur,           cls:'text-emerald-400' },
              { label:'Max speed', val:`${maxSpeed} km/h`, cls:'text-amber-400'   },
            ].map(({label,val,cls}) => (
              <div key={label}>
                <p className="text-slate-600 text-xs uppercase tracking-wider">{label}</p>
                <p className={`font-mono font-bold text-xs ${cls}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Date header */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-slate-400 text-xs font-semibold">
              {new Date(filterDate).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </p>
          </div>

          {/* Timeline */}
          <div className="px-3 pb-4 space-y-0">
            {results.map((event, i) => {
              const isFirst = i === 0;
              const isLast  = i === results.length - 1;
              const isAlert = event.type === 'alert';
              // Find next GPS point for segment distance
              const nextGps = results.slice(i+1).find(e => e.lat && e.lng);

              return (
                <div key={i}>
                  <StopRow
                    event={event}
                    isStart={isFirst}
                    isEnd={isLast && !isAlert}
                    isAlert={isAlert}
                    isActive={activeIdx === i}
                    onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                  />
                  {/* Segment info between GPS points */}
                  {!isLast && event.lat && nextGps && (
                    <SegmentRow
                      from={event}
                      to={nextGps}
                      onSelect={() => setActiveIdx(i)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Alert summary */}
          {alerts.length > 0 && (
            <div className="mx-4 mb-4 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-800/60 border-b border-slate-700">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  {alerts.length} alert{alerts.length>1?'s':''} recorded
                </p>
              </div>
              {alerts.map((a,i) => (
                <div key={i} className="px-3 py-2 border-b border-slate-700/50 last:border-0 flex items-start gap-2">
                  <AlertTriangle size={11} className={`flex-shrink-0 mt-0.5 ${a.alertType==='vibration'?'text-amber-400':'text-red-400'}`}/>
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertBadgeSmall type={a.alertType}/>
                      <span className="text-slate-500 font-mono text-xs">{fmtTime(a.timestamp)}</span>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5 leading-tight">{a.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 pb-4">
            <button onClick={handleClear}
              className="w-full py-2 bg-red-600/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-600/20 transition-colors">
              Clear all history
            </button>
          </div>
        </div>
      )}

      {!searched && (
        <div className="px-4 text-center py-8 space-y-2">
          <p className="text-slate-500 text-sm">No search yet</p>
          <p className="text-slate-600 text-xs leading-relaxed">
            Pick a date and time range, then press Search to view recorded events and GPS track.
          </p>
        </div>
      )}
    </div>
  );
}


// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MapPage() {
  const { data, alerts: feedAlerts } = useContext(AppContext);
  const gps    = data?.vehicle?.gps;
  const rawLat = gps?.latitude  ?? 0;
  const rawLng = gps?.longitude ?? 0;
  const hasFix = (gps?.satellites ?? 0) > 0 && (rawLat !== 0 || rawLng !== 0);

  // Use real GPS if available, otherwise fall back to UZ campus coordinates
  const lat = hasFix ? rawLat : UZ_FALLBACK.lat;
  const lng = hasFix ? rawLng : UZ_FALLBACK.lng;

  const [mode, setModeRaw]      = useState('normal');
  const [geofenceType, setGeofenceType] = useState('circle'); // 'circle' | 'polygon'
  const [pendingCenter, setPendingCenter] = useState(null);   // circle center
  const [polygonPoints, setPolygonPoints] = useState([]);     // polygon vertices

  const setMode = useCallback(next => {
    if (next !== 'geofence') { setPendingCenter(null); setPolygonPoints([]); }
    setModeRaw(next);
  }, []);

  // ── Geofence state ─────────────────────────────────────────────────────────
  const [geofence, setGeofence] = useState(() => { try { return JSON.parse(localStorage.getItem('cargotrack_geofence')); } catch { return null; } });
  const [radius, setRadius]     = useState(10000);
  const [breaches, setBreaches] = useState([]);  // geofence panel log (location exits)
  const wasInsideRef            = useRef(true);

  // Inside check works for both types
  const inside = !geofence || !hasFix ? true
    : geofence.type === 'circle'
    ? haversineM(lat, lng, geofence.lat, geofence.lng) <= geofence.radius
    : pointInPolygon(lat, lng, geofence.points);

  // Track geofence exits for the breach log only (no banner)
  useEffect(() => {
    if (!geofence || !hasFix) return;
    if (wasInsideRef.current && !inside) {
      reverseGeocode(lat, lng).then(name =>
        setBreaches(prev => [...prev, { lat, lng, locationName: name, time: new Date().toLocaleTimeString() }])
      );
    }
    wasInsideRef.current = inside;
  }, [inside, lat, lng, hasFix, geofence]);

  // ── Smart cargo alerts ─────────────────────────────────────────────────────
  // Only fire when something happens to cargo while outside geofence OR in transit
  const inTransit = (gps?.speed_kmh ?? 0) > 2;

  // ── Map banner alerts — filtered from unified feed ────────────────────────
  const mapBannerAlerts = feedAlerts
    .filter(a => {
      if (!['parcel', 'vibration', 'tamper', 'container'].includes(a.type)) return false;
      if (!(!inside || inTransit)) return false;
      if (isAtApprovedCheckpoint(lat, lng)) return false;
      // Only show removal / vibration / tamper as banners, not parcel detected or container closed
      if (a.type === 'parcel' && a.message.includes('detected')) return false;
      if (a.type === 'container' && a.message.includes('closed')) return false;
      return true;
    })
    .slice(0, 3);

  const saveCircleGeofence = name => {
    if (!pendingCenter) return;
    const gf = { type: 'circle', ...pendingCenter, radius, name };
    setGeofence(gf); localStorage.setItem('cargotrack_geofence', JSON.stringify(gf));
    setPendingCenter(null); setModeRaw('normal');
  };

  const savePolygonGeofence = name => {
    if (polygonPoints.length < 3) return;
    const gf = { type: 'polygon', points: polygonPoints, name };
    setGeofence(gf); localStorage.setItem('cargotrack_geofence', JSON.stringify(gf));
    setPolygonPoints([]); setModeRaw('normal');
  };

  const deleteGeofence = () => { setGeofence(null); localStorage.removeItem('cargotrack_geofence'); setBreaches([]); wasInsideRef.current = true; };

  // ── Route state ────────────────────────────────────────────────────────────
  const [waypoints, setWaypoints]           = useState(() => { try { return JSON.parse(localStorage.getItem('cargotrack_route')) ?? []; } catch { return []; } });
  const [optimisedRoute, setOptimisedRoute] = useState({ ordered: [], geometry: null, distanceKm: 0 });
  const [optimising, setOptimising]         = useState(false);
  const [optimiseError, setOptimiseError]   = useState('');

  const handleOptimise = async () => {
    setOptimising(true); setOptimiseError('');
    try { setOptimisedRoute(await optimiseWithOSRM(waypoints)); }
    catch { setOptimiseError('Could not optimise. Check connection and try again.'); }
    finally { setOptimising(false); }
  };

  const deleteWaypoint = i => { setWaypoints(prev => { const u = prev.filter((_,j)=>j!==i); localStorage.setItem('cargotrack_route', JSON.stringify(u)); return u; }); setOptimisedRoute({ ordered:[], geometry:null, distanceKm:0 }); };
  const clearRoute = () => { setWaypoints([]); setOptimisedRoute({ ordered:[], geometry:null, distanceKm:0 }); localStorage.removeItem('cargotrack_route'); };

  const handleLoadRoute = useCallback((route) => {
    setWaypoints(route.waypoints);
    localStorage.setItem('cargotrack_route', JSON.stringify(route.waypoints));
    if (route.isOptimised) {
      // Re-fetch OSRM geometry for the loaded route
      setOptimisedRoute({ ordered: route.waypoints, geometry: null, distanceKm: route.distanceKm ?? 0 });
      const coords = route.waypoints.map(w => `${w.lng},${w.lat}`).join(';');
      fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?roundtrip=false&source=first&destination=last&steps=false&geometries=geojson&overview=full`)
        .then(r => r.json())
        .then(j => {
          if (j.code === 'Ok') {
            const geometry = j.trips[0].geometry.coordinates.map(([lng,lat]) => [lat,lng]);
            setOptimisedRoute({ ordered: route.waypoints, geometry, distanceKm: j.trips[0].distance/1000 });
          }
        }).catch(() => {});
    } else {
      setOptimisedRoute({ ordered: [], geometry: null, distanceKm: 0 });
    }
  }, []);

  // ── GPS location — with UZ fallback when no fix ───────────────────────────
  const [locationName, setLocationName] = useState('');
  const lastGeocodedRef = useRef({ lat: 0, lng: 0 });
  useEffect(() => {
    if (!hasFix) {
      setLocationName(UZ_FALLBACK.name);
      return;
    }
    if (haversineM(lastGeocodedRef.current.lat, lastGeocodedRef.current.lng, lat, lng) < 100) return;
    lastGeocodedRef.current = { lat, lng };
    reverseGeocode(lat, lng).then(setLocationName);
  }, [lat, lng, hasFix]);

  // ── Map click ──────────────────────────────────────────────────────────────
  const handleMapClick = useCallback(async (clickLat, clickLng) => {
    if (mode === 'geofence') {
      if (geofenceType === 'circle') {
        if (!pendingCenter) setPendingCenter({ lat: clickLat, lng: clickLng });
      } else {
        // Polygon mode — if clicking near first point, close the shape
        if (polygonPoints.length >= 3) {
          const distToFirst = haversineM(clickLat, clickLng, polygonPoints[0].lat, polygonPoints[0].lng);
          if (distToFirst < 300) {
            // Close polygon automatically
            const name = await reverseGeocode(clickLat, clickLng);
            setPolygonPoints(prev => [...prev]); // trigger re-render
            return;
          }
        }
        const name = await reverseGeocode(clickLat, clickLng);
        setPolygonPoints(prev => [...prev, { lat: clickLat, lng: clickLng, name }]);
      }
    } else if (mode === 'route') {
      const name = await reverseGeocode(clickLat, clickLng);
      setWaypoints(prev => { const u = [...prev, { lat:clickLat, lng:clickLng, name }]; localStorage.setItem('cargotrack_route', JSON.stringify(u)); return u; });
      setOptimisedRoute({ ordered:[], geometry:null, distanceKm:0 });
    }
  }, [mode, geofenceType, pendingCenter, polygonPoints]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activePanel = searchParams.get('panel') ?? null;
  const setPanel = useCallback(key => {
    if (activePanel === key) setSearchParams({});
    else setSearchParams({ panel: key });
  }, [activePanel, setSearchParams]);
  const [historyActiveIdx, setHistoryActiveIdx] = useState(null);
  const [historyResults,   setHistoryResults]   = useState([]);
  const [historyOsrmGeom,  setHistoryOsrmGeom]  = useState(null);
  const historyPoint = historyActiveIdx !== null ? historyResults[historyActiveIdx] : null;

  // ── Event logger — writes real sensor events to localStorage ──────────────
  const prevLogRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    const prev = prevLogRef.current;
    prevLogRef.current = data;
    if (!prev) return;

    const now       = new Date().toISOString();
    const gpsData   = data.vehicle?.gps;
    const lat       = gpsData?.latitude;
    const lng       = gpsData?.longitude;
    const hasFix    = (gpsData?.satellites ?? 0) > 0 && lat && lng;
    const speed     = (gpsData?.speed_kmh ?? 0).toFixed(1);

    // Log GPS position every time it changes meaningfully
    if (hasFix) {
      const prevLat = prev.vehicle?.gps?.latitude;
      const prevLng = prev.vehicle?.gps?.longitude;
      if (!prevLat || haversineM(lat, lng, prevLat, prevLng) > 50) {
        reverseGeocode(lat, lng).then(name => {
          saveEvent({ type:'gps', timestamp:now, lat, lng, locationName:name, speed:Number(speed), note:`Vehicle at ${name} — ${speed} km/h` });
        });
      }
    }

    // Log shelf events
    ['shelf_1','shelf_2','shelf_3'].forEach(id => {
      const curr = data.shelves?.[id];
      const p    = prev.shelves?.[id];
      if (!curr || !p) return;
      const label = id.replace('_',' ').replace('s','S');

      if (p.parcel_present && !curr.parcel_present) {
        saveEvent({ type:'alert', alertType:'removal', timestamp:now, lat:hasFix?lat:UZ_FALLBACK.lat, lng:hasFix?lng:UZ_FALLBACK.lng, locationName:hasFix?null:UZ_FALLBACK.name, note:`Parcel removed from ${label}`, speed:Number(speed) });
      }
      if (!p.vibration && curr.vibration) {
        saveEvent({ type:'alert', alertType:'vibration', timestamp:now, lat:hasFix?lat:UZ_FALLBACK.lat, lng:hasFix?lng:UZ_FALLBACK.lng, locationName:hasFix?null:UZ_FALLBACK.name, note:`Impact detected on ${label}`, speed:Number(speed) });
      }
      if (p.reed_switch === 'CLOSED' && curr.reed_switch !== 'CLOSED') {
        saveEvent({ type:'alert', alertType:'tamper', timestamp:now, lat:hasFix?lat:UZ_FALLBACK.lat, lng:hasFix?lng:UZ_FALLBACK.lng, locationName:hasFix?null:UZ_FALLBACK.name, note:`Tampering on ${label} — latch opened`, speed:Number(speed) });
      }
    });
  }, [data]);
  const displayWaypoints = optimisedRoute.ordered.length > 0 ? optimisedRoute.ordered : waypoints;
  const isOptimised = optimisedRoute.ordered.length > 0;
  const previewGeofence = geofence ?? (pendingCenter ? { type:'circle', ...pendingCenter, radius } : null);
  const fenceColor = inside ? '#22c55e' : '#ef4444';

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex-1 relative">
        <MapContainer center={[lat,lng]} zoom={hasFix ? 14 : 15} style={{ width:'100%', height:'100%' }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <MapEvents mode={mode} geofenceType={geofenceType} onMapClick={handleMapClick}/>

          {/* Circle geofence */}
          {previewGeofence?.type === 'circle' && (
            <Circle center={[previewGeofence.lat, previewGeofence.lng]} radius={previewGeofence.radius}
              pathOptions={{ color: fenceColor, fillColor: fenceColor, fillOpacity: 0.06, weight: 2, dashArray: geofence?'8 4':'5 5' }}>
              {geofence && <Tooltip permanent direction="top"><span className="text-xs">{geofence.name}</span></Tooltip>}
            </Circle>
          )}

          {/* Polygon geofence — saved */}
          {geofence?.type === 'polygon' && (
            <Polygon positions={geofence.points.map(p => [p.lat, p.lng])}
              pathOptions={{ color: fenceColor, fillColor: fenceColor, fillOpacity: 0.08, weight: 2 }}>
              <Tooltip permanent direction="top"><span className="text-xs">{geofence.name}</span></Tooltip>
            </Polygon>
          )}

          {/* Polygon in-progress — dashed outline */}
          {mode === 'geofence' && geofenceType === 'polygon' && polygonPoints.length > 0 && (
            <>
              <Polyline
                positions={[...polygonPoints.map(p=>[p.lat,p.lng]), polygonPoints.length>=2?[polygonPoints[0].lat,polygonPoints[0].lng]:[]].filter(p=>p.length)}
                pathOptions={{ color: '#a855f7', weight: 2, dashArray: '6 4', opacity: 0.8 }}
              />
              {polygonPoints.map((p, i) => (
                <Marker key={i} position={[p.lat, p.lng]} icon={makeVertexIcon(i, i===0)}>
                  <Tooltip direction="top" offset={[0,-8]}><span className="text-xs">{i===0?'Start point (click to close)':p.name}</span></Tooltip>
                </Marker>
              ))}
            </>
          )}

          {/* Route lines */}
          {isOptimised && optimisedRoute.geometry && <Polyline positions={optimisedRoute.geometry} pathOptions={{ color:'#22c55e', weight:4, opacity:0.9 }}/>}
          {!isOptimised && waypoints.length > 1 && <Polyline positions={waypoints.map(w=>[w.lat,w.lng])} pathOptions={{ color:'#3b82f6', weight:2, opacity:0.6, dashArray:'6 4' }}/>}

          {/* Route waypoints */}
          {displayWaypoints.map((wp, i) => (
            <Marker key={i} position={[wp.lat,wp.lng]} icon={makeWaypointIcon(i, isOptimised)}>
              <Popup><div className="bg-slate-800 text-slate-200 p-2 rounded text-xs space-y-0.5"><p className="font-bold" style={{color:isOptimised?'#22c55e':'#3b82f6'}}>Stop {i+1}</p><p>{wp.name}</p></div></Popup>
            </Marker>
          ))}

          {/* Vehicle marker — real GPS or UZ fallback */}
          <Marker position={[lat,lng]} icon={makeVehicleIcon(inside)}>
            <Popup>
              <div className="bg-slate-800 text-slate-200 p-3 rounded-lg min-w-44 text-xs space-y-1.5">
                <p className="font-bold text-blue-400">Your Vehicle</p>
                <p className="text-slate-300">{locationName}</p>
                <p>Speed: <span className="font-mono font-bold">{(gps?.speed_kmh??0).toFixed(1)} km/h</span></p>
                <p>Sats: <span className="font-mono">{hasFix ? (gps?.satellites??0) : 8}</span></p>
                {geofence && <p className={inside?'text-emerald-400':'text-red-400'}>{inside?'✓ Inside geofence':'✗ Outside geofence'}</p>}
              </div>
            </Popup>
          </Marker>

          {/* Approved checkpoint markers */}
          {APPROVED_CHECKPOINTS.map((cp, i) => (
            <Circle key={i} center={[cp.lat, cp.lng]} radius={CHECKPOINT_RADIUS_M}
              pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.08, weight: 1.5, dashArray: '4 3' }}>
              <Tooltip direction="top"><span className="text-xs">✓ Approved: {cp.name}</span></Tooltip>
            </Circle>
          ))}

          {/* ── History overlays — driven by real search results ─────────── */}
          {activePanel === 'history' && historyResults.length > 0 && (
            <>
              {/* GPS track — use OSRM road geometry when available, fallback to straight lines */}
              {historyOsrmGeom ? (
                <Polyline positions={historyOsrmGeom}
                  pathOptions={{ color:'#6366f1', weight:3.5, opacity:0.85 }}/>
              ) : historyResults.filter(e => e.lat && e.lng).length > 1 && (
                <Polyline
                  positions={historyResults.filter(e=>e.lat&&e.lng).map(e=>[e.lat,e.lng])}
                  pathOptions={{ color:'#6366f1', weight:3, opacity:0.75, dashArray:'6 3' }}
                />
              )}

              {/* Event markers */}
              {historyResults.map((event, i) => {
                if (!event.lat || !event.lng) return null;
                return (
                  <Marker key={`hist-${i}`} position={[event.lat,event.lng]}
                    icon={makeHistoryIcon(event.type)}
                    eventHandlers={{ click: () => setHistoryActiveIdx(historyActiveIdx===i?null:i) }}>
                    <Popup>
                      <div className="bg-slate-800 text-slate-200 p-3 rounded-lg text-xs space-y-1.5 min-w-48">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`font-bold text-sm ${event.type==='alert'?'text-red-400':'text-blue-400'}`}>
                            {event.locationName || 'Unknown location'}
                          </p>
                          <span className="text-slate-500 font-mono flex-shrink-0">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-slate-300 leading-tight">{event.note}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono">{event.speed} km/h</span>
                          {event.type==='alert' && <AlertBadgeSmall type={event.alertType}/>}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Highlight ring on selected */}
              {historyPoint?.lat && historyPoint?.lng && (
                <CircleMarker center={[historyPoint.lat, historyPoint.lng]} radius={16}
                  pathOptions={{ color:'#fff', fillColor:'transparent', weight:2, opacity:0.7 }}/>
              )}

              {/* Fly to selected */}
              {historyPoint?.lat && historyPoint?.lng && <FlyToPoint point={historyPoint}/>}
            </>
          )}

        </MapContainer>

        {/* Smart cargo alert banners */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col gap-2 items-center pointer-events-none" style={{ minWidth: 340 }}>
          {mapBannerAlerts.map((alert, i) => (
            <div key={i} className={`w-full backdrop-blur border rounded-xl px-4 py-2.5 flex items-start gap-3 shadow-lg ${
              alert.severity === 'critical'
                ? 'bg-red-600/90 border-red-400 text-white'
                : 'bg-amber-600/90 border-amber-400 text-white'
            }`}>
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 opacity-80"/>
              <div>
                <p className="font-bold text-sm leading-tight">{alert.message}</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {!inside ? `outside ${geofence?.name ?? 'delivery zone'}` : 'while in transit'} · {new Date(alert.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-700/60 px-4 py-2 flex items-center gap-4 text-xs z-10">
          <Navigation size={12} className={hasFix?'text-emerald-400':'text-amber-400'}/>
          <span className="text-white font-medium">{locationName||(hasFix?'Locating...':'No GPS Fix')}</span>
          <span className="text-slate-400 font-mono">{(gps?.speed_kmh??0).toFixed(1)} km/h</span>
          <span className="text-slate-400 font-mono">{gps?.satellites??0} sats</span>
          {isOptimised && <span className="text-emerald-400 font-semibold">● Optimised route active</span>}
          <span className="ml-auto text-slate-500">Updated: {data?.last_updated ? new Date(data.last_updated).toLocaleTimeString() : '—'}</span>
        </div>
      </div>

      {/* Left slide-out panel — driven by sidebar sub-item selection */}
      {activePanel && (
        <div className="w-80 bg-slate-900 border-r border-slate-700/60 flex flex-col overflow-hidden flex-shrink-0">

          {/* Panel header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activePanel === 'gps'      && <><Navigation size={14} className="text-blue-400"/><h2 className="text-white font-semibold text-sm">GPS</h2></>}
              {activePanel === 'geofence' && <><Target    size={14} className="text-purple-400"/><h2 className="text-white font-semibold text-sm">Geofence</h2></>}
              {activePanel === 'route'    && <><MapPin    size={14} className="text-emerald-400"/><h2 className="text-white font-semibold text-sm">Route</h2></>}
              {activePanel === 'history'  && <><History   size={14} className="text-amber-400"/><h2 className="text-white font-semibold text-sm">History</h2></>}
            </div>
            <button onClick={() => setSearchParams({})} className="text-slate-500 hover:text-slate-300 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === 'gps' && (
              <GPSPanel gps={gps} locationName={locationName} insideZone={inside} geofence={geofence} hasFix={hasFix}/>
            )}
            {activePanel === 'geofence' && (
              <GeofencePanel
                mode={mode} setMode={setMode}
                geofenceType={geofenceType} setGeofenceType={setGeofenceType}
                geofence={geofence} pendingCenter={pendingCenter}
                polygonPoints={polygonPoints} radius={radius} setRadius={setRadius}
                onSaveCircle={saveCircleGeofence} onSavePolygon={savePolygonGeofence}
                onDelete={deleteGeofence} breaches={breaches}
                cargoAlerts={mapBannerAlerts}
                onDismissAlert={() => {}} // alerts managed by useAlertFeed hook
              />
            )}
            {activePanel === 'route' && (
              <RoutePanel
                mode={mode} setMode={setMode}
                waypoints={waypoints} optimisedRoute={optimisedRoute}
                onDeleteWaypoint={deleteWaypoint} onClearRoute={clearRoute}
                onOptimise={handleOptimise} optimising={optimising}
                optimiseError={optimiseError} onLoadRoute={handleLoadRoute}
              />
            )}
            {activePanel === 'history' && (
              <HistoryPanel
                activeIdx={historyActiveIdx} setActiveIdx={setHistoryActiveIdx}
                onResults={setHistoryResults} onOsrmGeom={setHistoryOsrmGeom}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}