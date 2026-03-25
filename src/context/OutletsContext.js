import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api from '../api/client';
import { DEFAULT_OUTLETS } from '../constants/outlets';
import { useAuth } from './AuthContext';

const OutletsContext = createContext(null);

export function OutletsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshOutlets = useCallback(async () => {
    if (!isAuthenticated) {
      setRecords(DEFAULT_OUTLETS.map((name, idx) => ({ id: `default-${idx}`, name })));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/outlets');
      const rows = Array.isArray(data.outlets) ? data.outlets : [];
      if (rows.length) {
        setRecords(rows);
      } else {
        setRecords(DEFAULT_OUTLETS.map((name, idx) => ({ id: `default-${idx}`, name })));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load outlets');
      setRecords(DEFAULT_OUTLETS.map((name, idx) => ({ id: `default-${idx}`, name })));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshOutlets();
  }, [refreshOutlets]);

  async function addOutlet(name) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, message: 'Outlet name is required' };

    try {
      await api.post('/outlets', { name: clean });
      await refreshOutlets();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.response?.data?.message || 'Unable to add outlet' };
    }
  }

  async function removeOutlet(outletId) {
    try {
      await api.delete(`/outlets/${outletId}`);
      await refreshOutlets();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.response?.data?.message || 'Unable to delete outlet' };
    }
  }

  const outlets = useMemo(() => records.map((r) => r.name), [records]);

  return (
    <OutletsContext.Provider
      value={{
        outlets,
        outletRecords: records,
        addOutlet,
        removeOutlet,
        refreshOutlets,
        loading,
        error,
      }}
    >
      {children}
    </OutletsContext.Provider>
  );
}

export function useOutlets() {
  const ctx = useContext(OutletsContext);
  if (!ctx) throw new Error('useOutlets must be used inside OutletsProvider');
  return ctx;
}
