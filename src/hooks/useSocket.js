import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

export function useSocket(enabled) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const s = io(SOCKET_URL);
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return useMemo(() => socket, [socket]);
}
