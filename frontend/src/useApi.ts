import { useEffect, useState } from "react";
import { api } from "./api";
export function useApi<T>(path: string) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    path?: string;
    revision?: number;
  }>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, path, revision });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ error: error.message, path, revision });
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    ...(state.path === path && state.revision === revision ? state : {}),
    reload: () => setRevision((value) => value + 1),
  };
}
