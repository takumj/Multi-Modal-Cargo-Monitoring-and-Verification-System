import { createContext } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
 
import useFirebaseData from './hooks/useFirebaseData';
import useAlertFeed    from './hooks/useAlertFeed';
 
import Sidebar            from './components/Sidebar';
import Header             from './components/Header';
import ToastNotification  from './components/ToastNotification';
 
import Dashboard     from './pages/Dashboard';
import MapPage       from './pages/MapPage';
import ShelvesPage   from './pages/ShelvesPage';
import CameraPage    from './pages/CameraPage';
import AnalyticsPage from './pages/AnalyticsPage';
 
export const AppContext = createContext(null);
 
function AppContent() {
  const { data, connected }       = useFirebaseData();
  const { alerts, criticalCount } = useAlertFeed(data);
 
  const ctx = { data, connected, alerts, criticalCount };
 
  return (
    <AppContext.Provider value={ctx}>
      <div className="flex h-screen bg-slate-950 dark overflow-hidden">
        <Sidebar />
 
        <div className="flex-1 flex flex-col ml-60 min-w-0">
          <Header />
 
          <main className="flex-1 overflow-y-auto mt-16">
            <Routes>
              <Route path="/"          element={<Dashboard />}      />
              <Route path="/map"       element={<MapPage />}         />
              <Route path="/shelves"   element={<ShelvesPage />}     />
              <Route path="/camera"    element={<CameraPage />}      />
              <Route path="/analytics" element={<AnalyticsPage />}   />
            </Routes>
          </main>
        </div>
 
        <ToastNotification data={data} />
 
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
              borderRadius: '12px',
              fontSize: '13px',
            },
          }}
        />
      </div>
    </AppContext.Provider>
  );
}
 
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}