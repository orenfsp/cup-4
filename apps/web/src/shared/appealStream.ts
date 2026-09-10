import { api, RequestError } from "./api";
import { streamEvents } from "@otklik/contracts";

type Listener = (error?: RequestError) => void;
type Connection = { listeners: Set<Listener>; live: boolean; stop: () => void };
const connections = new Map<string, Connection>();

export function streamLive(path: string) {
  return connections.get(path)?.live ?? false;
}

export function subscribeStream(path: string, listener: Listener) {
  let connection = connections.get(path);
  if (!connection) {
    let source: EventSource | undefined;
    let timer: number | undefined;
    let stopped = false;
    let denied = false;
    let delay = 1000;
    let epoch = 0;
    const controller = new AbortController();
    const entry: Connection = {
      listeners: new Set(),
      live: false,
      stop: () => {
        stopped = true;
        epoch++;
        source?.close();
        controller.abort();
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", visibility);
      },
    };
    const notify = (error?: RequestError) => {
      entry.listeners.forEach((callback) => callback(error));
    };
    const revoke = (error: RequestError) => {
      denied = true;
      entry.live = false;
      source?.close();
      window.clearTimeout(timer);
      notify(error);
    };
    const failed = async (failedSource: EventSource) => {
      if (source !== failedSource || stopped || denied) return;
      failedSource.close();
      source = undefined;
      entry.live = false;
      const revision = ++epoch;
      try {
        await api(
          path.replace(/stream\/$/, "messages/"),
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
      } catch (error) {
        if (
          revision === epoch &&
          error instanceof RequestError &&
          [401, 403, 404].includes(error.status)
        ) {
          revoke(error);
          return;
        }
      }
      if (!stopped && !denied && revision === epoch) {
        notify();
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      }
    };
    const connect = () => {
      epoch++;
      window.clearTimeout(timer);
      source?.close();
      if (
        stopped ||
        denied ||
        document.visibilityState !== "visible" ||
        typeof EventSource === "undefined"
      )
        return;
      source = new EventSource(path);
      const activeSource = source;
      source.addEventListener(streamEvents.changed, () => {
        if (source !== activeSource || stopped || denied) return;
        entry.live = true;
        delay = 1000;
        notify();
      });
      source.addEventListener(streamEvents.revoked, () => {
        if (source === activeSource) revoke(new RequestError("forbidden", 403));
      });
      source.addEventListener(
        streamEvents.retry,
        () => void failed(activeSource),
      );
      source.onerror = () => void failed(activeSource);
    };
    const visibility = () => {
      epoch++;
      entry.live = false;
      source?.close();
      source = undefined;
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") connect();
    };
    document.addEventListener("visibilitychange", visibility);
    connections.set(path, entry);
    connection = entry;
    // Subscribers attach before the server's initial changed event.
    timer = window.setTimeout(connect, 0);
  }
  connection.listeners.add(listener);
  return () => {
    connection.listeners.delete(listener);
    if (!connection.listeners.size) {
      connection.stop();
      connections.delete(path);
    }
  };
}
