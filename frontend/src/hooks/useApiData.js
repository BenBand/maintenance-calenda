import { useCallback, useEffect, useRef, useState } from 'react';

export function useApiData(loader) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const data = await loader();
      if (requestIdRef.current === requestId) {
        setState({ data, loading: false, error: null });
      }
      return data;
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setState({ data: null, loading: false, error: error.message || 'Unable to load data' });
      }
      return null;
    }
  }, [loader]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { ...state, reload: load };
}
