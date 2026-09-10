import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export function useResource<T>(path: string, poll = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const reload = useCallback(() => {
    generation.current += 1;
    setAttempt((n) => n + 1);
  }, []);
  const update = useCallback((value: T) => {
    generation.current += 1;
    setData(value);
    setError(undefined);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      const revision = generation.current;
      try {
        const result = await api<T>(path, undefined, controller.signal);
        if (!controller.signal.aborted && revision === generation.current) {
          setData(result);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted && revision === generation.current)
          setError(cause);
      } finally {
        running = false;
      }
    };
    void load();
    const timer = poll
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, poll)
      : undefined;
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [path, attempt, poll]);
  return { data, error, reload, update };
}
