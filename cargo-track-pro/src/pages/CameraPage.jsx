import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera, CameraOff, FlipHorizontal, Download, AlertTriangle } from 'lucide-react';
import { AppContext } from '../App';
import { format } from 'date-fns';

export default function CameraPage() {
  const { data }                          = useContext(AppContext);
  const webcamRef                         = useRef(null);
  const [camOn,       setCamOn]           = useState(false);
  const [mirrored,    setMirrored]        = useState(false);
  const [snapshots,   setSnapshots]       = useState([]);
  const [motionAlert, setMotionAlert]     = useState(false);
  const [clock,       setClock]           = useState('');
  const [camError,    setCamError]        = useState(null);
  const [devices,     setDevices]         = useState([]);
  const [deviceId,    setDeviceId]        = useState(null); // null = not yet resolved

  // Enumerate video devices and default to index 0
  useEffect(() => {
    async function loadDevices() {
      try {
        // Trigger permission prompt first so labels are populated
        await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter(d => d.kind === 'videoinput');
        setDevices(cams);
        if (cams.length > 0) setDeviceId(cams[0].deviceId);
      } catch (_) {
        // Permission denied or no devices — leave deviceId null, let webcam handle the error
      }
    }
    loadDevices();
  }, []);

  const shelves = data?.shelves ?? {};

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // Motion detection event
  useEffect(() => {
    const handler = () => {
      setMotionAlert(true);
      setTimeout(() => setMotionAlert(false), 3000);
    };
    window.addEventListener('motionDetected', handler);
    return () => window.removeEventListener('motionDetected', handler);
  }, []);

  const takeSnapshot = useCallback(() => {
    if (!webcamRef.current) return;
    const imgSrc = webcamRef.current.getScreenshot();
    if (!imgSrc) return;
    const ts = format(new Date(), 'yyyyMMdd-HHmmss');
    const snap = { id: Date.now(), src: imgSrc, timestamp: new Date(), filename: `cargo-cam-snapshot-${ts}.jpg` };
    setSnapshots(s => [snap, ...s].slice(0, 18));

    // Trigger download
    const a = document.createElement('a');
    a.href     = imgSrc;
    a.download = snap.filename;
    a.click();
  }, []);

  const shelfBadges = [1, 2, 3].map(n => {
    const s = shelves[`shelf_${n}`];
    return { n, occupied: s?.parcel_present ?? false };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Camera size={20} className="text-blue-400" />
        <h1 className="text-white font-bold text-xl">Camera Monitor</h1>
      </div>

      {/* Camera feed card */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        <div className="relative bg-black" style={{ minHeight: 400 }}>
          {camOn ? (
            <>
              <Webcam
                ref={webcamRef}
                mirrored={mirrored}
                screenshotFormat="image/jpeg"
                onUserMediaError={err => {
                  setCamError(err.message || 'Permission denied');
                  setCamOn(false);
                }}
                style={{ width: '100%', display: 'block', maxHeight: 520, objectFit: 'cover' }}
                videoConstraints={deviceId
                  ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                  : { width: { ideal: 1280 }, height: { ideal: 720 } }
                }
              />

              {/* HUD overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Top-left: LIVE badge */}
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs font-bold text-white">
                    <span className="w-2 h-2 rounded-full bg-red-500 pulse-ring" />
                    LIVE
                  </span>
                  <span className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs text-slate-300">
                    Shelf Monitor Cam
                  </span>
                </div>

                {/* Top-right: timestamp */}
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-xs font-mono text-slate-300">
                  {clock}
                </div>

                {/* Bottom: shelf status HUD */}
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 justify-center">
                  {shelfBadges.map(({ n, occupied }) => (
                    <span
                      key={n}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur ${
                        occupied
                          ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-slate-800/60 text-slate-400 border border-slate-600/50'
                      }`}
                    >
                      S{n}: {occupied ? 'OCCUPIED' : 'EMPTY'}
                    </span>
                  ))}
                </div>

                {/* Motion detection banner */}
                {motionAlert && (
                  <div className="absolute top-16 left-0 right-0 flex justify-center slide-in-top">
                    <div className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-xl">
                      <AlertTriangle size={16} />
                      MOTION DETECTED
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center" style={{ minHeight: 400 }}>
              {camError ? (
                <div className="text-center px-8 space-y-4">
                  <CameraOff size={48} className="text-red-400 mx-auto" />
                  <p className="text-red-400 font-semibold text-lg">Camera Access Denied</p>
                  <p className="text-slate-400 text-sm max-w-sm">
                    {camError}. To enable camera: click the camera icon in your browser's address bar,
                    allow access, then refresh the page.
                  </p>
                  <button
                    onClick={() => { setCamError(null); setCamOn(true); }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Camera size={48} className="text-slate-600 mx-auto" />
                  <p className="text-slate-400">Camera is off</p>
                  <p className="text-slate-500 text-sm">Click "Start Camera" to begin monitoring</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-slate-700 bg-slate-900/60">
          {devices.length > 1 && (
            <select
              value={deviceId ?? ''}
              onChange={e => { setDeviceId(e.target.value); setCamOn(false); setTimeout(() => setCamOn(true), 100); }}
              className="bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-blue-500"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => { setCamError(null); setCamOn(true); }}
            disabled={camOn}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-sm font-semibold hover:bg-emerald-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Camera size={14} />
            Start Camera
          </button>

          <button
            onClick={() => setCamOn(false)}
            disabled={!camOn}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/40 rounded-lg text-sm font-semibold hover:bg-red-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CameraOff size={14} />
            Stop Camera
          </button>

          <button
            onClick={() => setMirrored(m => !m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              mirrored
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
            }`}
          >
            <FlipHorizontal size={14} />
            Mirror
          </button>

          <button
            onClick={takeSnapshot}
            disabled={!camOn}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/40 rounded-lg text-sm font-semibold hover:bg-purple-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            <Download size={14} />
            Snapshot
          </button>
        </div>
      </div>

      {/* Snapshots gallery */}
      {snapshots.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">
            Snapshots <span className="text-slate-500 text-sm font-normal">({snapshots.length})</span>
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {snapshots.map(snap => (
              <div key={snap.id} className="group relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-700 hover:border-blue-500/50 transition-colors">
                <img
                  src={snap.src}
                  alt={snap.filename}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                  <a
                    href={snap.src}
                    download={snap.filename}
                    className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                  >
                    <Download size={14} className="text-white" />
                  </a>
                  <p className="text-white text-xs px-1 text-center">
                    {format(snap.timestamp, 'HH:mm:ss')}
                  </p>
                </div>
                <p className="absolute bottom-0 left-0 right-0 text-center text-slate-400 text-xs pb-1 truncate px-1">
                  {format(snap.timestamp, 'HH:mm')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
