import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

export default function ToastNotification({ data }) {
  const prevRef = useRef(null);

  useEffect(() => {
    if (!data) {
      prevRef.current = data;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = data;
    if (!prev) return;

    // Tilt detected
    if (!prev.vehicle?.imu?.tilted && data.vehicle?.imu?.tilted) {
      const angle = data.vehicle?.imu?.tilt_angle?.toFixed(1) ?? '?';
      toast.error(`Vehicle tilt detected! ${angle}°`, {
        duration: 5000,
        icon: '⚠️',
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #ef4444' },
      });
    }

    // Vibration on any shelf
    ['shelf_1', 'shelf_2', 'shelf_3'].forEach((id, i) => {
      const pv = prev.shelves?.[id];
      const cv = data.shelves?.[id];
      if (!pv || !cv) return;

      if (!pv.vibration && cv.vibration) {
        toast(`Vibration on Shelf ${i + 1}`, {
          duration: 4000,
          icon: '📳',
          style: { background: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b' },
        });
      }

      // Parcel unexpectedly removed
      if (pv.parcel_present && !cv.parcel_present) {
        toast.error(`Parcel removed from Shelf ${i + 1}`, {
          duration: 4000,
          icon: '📦',
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #ef4444' },
        });
      }
    });
  }, [data]);

  return null;
}
