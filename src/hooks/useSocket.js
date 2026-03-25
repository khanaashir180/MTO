import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket(enabled) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const s = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:4000');
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return useMemo(() => socket, [socket]);
}
