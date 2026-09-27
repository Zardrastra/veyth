export type Mood = "happy" | "idle" | "love" | "oops";

export function Mascot({
  size = 32,
  mood = "happy",
  interactive = false,
}: {
  size?: number;
  mood?: Mood;
  interactive?: boolean;
}) {
  const eyeY = mood === "love" ? 14 : 13.5;
  const eyeFill = mood === "love" || mood === "oops" ? "#ff4d6a" : "var(--color-accent, #c8ff00)";
  return (
    <span
      className={`inline-flex shrink-0 ${interactive ? "vey-mascot" : ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* antenna — bobs */}
        <g className={interactive ? "vey-antenna" : ""}>
          <line x1="16" y1="6" x2="16" y2="3.5" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="2.2" r="1.8" fill="var(--color-accent, #c8ff00)" />
          <circle cx="16" cy="2.2" r="0.7" fill="#0a0a0a" opacity="0.35" />
        </g>
        {/* body — wiggles */}
        <g className={interactive ? "vey-body" : ""}>
          <rect x="7" y="7" width="18" height="16" rx="4.5" fill="#1c1c1c" stroke="#2a2a2a" strokeWidth="1.3" />
          <rect x="10.5" y="10.5" width="11" height="9" rx="2.2" fill="#0a0a0a" stroke="#2a2a2a" strokeWidth="1" />
          <circle cx="14.2" cy={eyeY} r="1.7" fill={eyeFill} className={interactive ? "vey-eye" : ""} />
          <circle cx="17.8" cy={eyeY} r="1.7" fill={eyeFill} className={interactive ? "vey-eye" : ""} />
          {mood === "happy" ? (
            <path d="M13.8 17.2 Q16 19 18.2 17.2" stroke="#5a5a5a" strokeWidth="1" strokeLinecap="round" fill="none" />
          ) : mood === "oops" ? (
            <path d="M13.8 18.4 Q16 16.8 18.2 18.4" stroke="#ff4d6a" strokeWidth="1" strokeLinecap="round" fill="none" />
          ) : mood === "love" ? (
            <path d="M14.5 17.5 Q16 19.2 17.5 17.5" stroke="#ff4d6a" strokeWidth="1" strokeLinecap="round" fill="none" />
          ) : (
            <line x1="14.5" y1="17.5" x2="17.5" y2="17.5" stroke="#5a5a5a" strokeWidth="1" strokeLinecap="round" />
          )}
          {mood === "love" && (
            <>
              <circle cx="12.2" cy="16.5" r="0.9" fill="#ff4d6a" opacity="0.35" />
              <circle cx="19.8" cy="16.5" r="0.9" fill="#ff4d6a" opacity="0.35" />
            </>
          )}
          <circle cx="8.5" cy="15" r="0.9" fill="#2a2a2a" />
          <circle cx="23.5" cy="15" r="0.9" fill="#2a2a2a" />
        </g>
        {/* feet — tap */}
        <g className={interactive ? "vey-feet" : ""}>
          <rect x="11" y="24.2" width="4" height="1.6" rx="0.8" fill="#2a2a2a" />
          <rect x="17" y="24.2" width="4" height="1.6" rx="0.8" fill="#2a2a2a" />
        </g>
      </svg>
    </span>
  );
}

export function MascotIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="7" y="7" width="18" height="16" rx="4.5" fill="#1c1c1c" stroke="#2a2a2a" strokeWidth="1.3" />
      <rect x="10.5" y="10.5" width="11" height="9" rx="2.2" fill="#0a0a0a" />
      <circle cx="14.2" cy="14" r="1.7" fill="#c8ff00" />
      <circle cx="17.8" cy="14" r="1.7" fill="#c8ff00" />
      <circle cx="16" cy="2.2" r="1.8" fill="#c8ff00" />
    </svg>
  );
}
