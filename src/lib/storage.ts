import { useCallback, useState } from "react";

// localStorage can throw (private mode, blocked storage) — always degrade to in-memory.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        write(key, v);
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}

export function usePinned() {
  const [pinned, setPinned] = useStored<string[]>("veyth:pinned", []);
  const toggle = useCallback(
    (slug: string) => setPinned((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug])),
    [setPinned],
  );
  return { pinned, toggle };
}
