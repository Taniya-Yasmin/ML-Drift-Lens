import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetches once on mount, then re-fetches every `intervalMs`.
 * Used to keep the dashboard "live" against the real backend without
 * requiring a websocket layer that doesn't exist yet.
 */
export default function usePolling(fetcher, intervalMs = 15000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    run();
    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, intervalMs, ...deps]);

  return { data, error, loading, refetch: run };
}
