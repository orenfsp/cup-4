import { useCallback, useEffect, useRef, useState } from "react";
import { api, RequestError } from "./api";
import { streamLive, subscribeStream } from "./appealStream";

export function useResource<T>(
  path: string,
  poll = 0,
  stream = "",
  loader?: (path: string, signal: AbortSignal) => Promise<T>,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const denied = useRef(false);
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
    denied.current = false;
    if (!stream) return;
    return subscribeStream(stream, (cause) => {
      if (cause) {
        denied.current = true;
        generation.current += 1;
        setData(undefined);
        setError(cause);
      } else reload();
    });
  }, [stream, reload]);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running || denied.current) return;
      running = true;
      const revision = generation.current;
      try {
        const result = loader
          ? await loader(path, controller.signal)
          : await api<T>(path, undefined, controller.signal);
        if (!controller.signal.aborted && revision === generation.current) {
          setData(result);
          setError(undefined);
        }
      } catch (cause) {
        if (!controller.signal.aborted && revision === generation.current) {
          setError(cause);
          if (
            cause instanceof RequestError &&
            [401, 403, 404].includes(cause.status)
          )
            setData(undefined);
        }
      } finally {
        running = false;
      }
    };
    void load();
    const timer = poll
      ? window.setInterval(() => {
          if (
            document.visibilityState === "visible" &&
            (!stream || !streamLive(stream))
          )
            void load();
        }, poll)
      : undefined;
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [path, attempt, poll, stream, loader]);
  return { data, error, reload, update };
}
