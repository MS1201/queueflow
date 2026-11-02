import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socket.js';

/**
 * Loads data, then keeps it fresh: refetches when the server pushes a queue update
 * for `serviceId` (or any service when null), plus a slow poll as a safety net.
 */
export function useLive(load, serviceId, depKey = '') {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;
  const timer = useRef(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    try {
      const data = await loadRef.current();
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (alive.current) setState((s) => ({ ...s, error: err, loading: false }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    run();
    const socket = getSocket();
    const eventName = serviceId ? 'queue:update' : 'services:update';
    const join = () => (serviceId ? socket.emit('subscribe', serviceId) : socket.emit('subscribe:all'));
    const onUpdate = (ev) => {
      if (serviceId && ev?.serviceId && ev.serviceId !== serviceId) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(run, 150);
    };
    join();
    socket.on('connect', join);
    socket.on(eventName, onUpdate);
    const poll = setInterval(run, 15000);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearInterval(poll);
      socket.off('connect', join);
      socket.off(eventName, onUpdate);
    };
  }, [serviceId, depKey, run]);

  return { ...state, reload: run };
}

/** Re-renders every `ms` so countdowns and elapsed timers stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
