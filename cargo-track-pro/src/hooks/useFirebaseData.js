import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

export default function useFirebaseData() {
  const [data, setData]           = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const dataRef = ref(db, 'cargo_system');
    const connRef = ref(db, '.info/connected');

    const unsubData = onValue(dataRef, snapshot => {
      setData(snapshot.val());
    });

    const unsubConn = onValue(connRef, snapshot => {
      setConnected(snapshot.val() === true);
    });

    return () => {
      unsubData();
      unsubConn();
    };
  }, []);

  return { data, connected };
}
