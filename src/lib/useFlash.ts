import { useState } from "react";

/** A message that clears itself after `ms` — for "Copied ✓"-style button feedback. */
export function useFlash(ms = 1500) {
  const [msg, setMsg] = useState("");
  return [msg, (m: string) => { setMsg(m); setTimeout(() => setMsg(""), ms); }] as const;
}
