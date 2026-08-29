"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Momo — the app's companion.
 *
 * A soft dumpling blob with a sprout, drawn entirely in SVG so it stays crisp
 * and costs nothing to ship. Everything that moves moves via transform/opacity
 * so the whole creature stays on the compositor.
 *
 * Mood drives the eyes, the mouth, the body motion and the little props around
 * it. The rest of the app just says how it feels and Momo does the acting.
 */

export type Mood =
  | "idle"
  | "curious"
  | "thinking"
  | "excited"
  | "celebrating"
  | "caring"
  | "proud"
  | "sleepy";

type Props = {
  mood?: Mood;
  size?: number;
  className?: string;
  /** Hides the little floating props (magnifier, sparkles, hearts). */
  bare?: boolean;
  /**
   * The soft ellipse Momo floats above. Turn it off when Momo is placed over
   * artwork — on the journey road it reads as a smudge, not a shadow.
   */
  shadow?: boolean;
  /** Poking Momo makes it squish and grin. On by default; it is the point. */
  interactive?: boolean;
};

const BODY =
  "M60 24 C85 24 101 43 101 66 C101 91 83 106 60 106 C37 106 19 91 19 66 C19 43 35 24 60 24 Z";

export function Momo({
  mood = "idle",
  size = 120,
  className,
  bare,
  shadow = true,
  interactive = true,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Today renders seven Momos; without this every one of them keeps ~6 looping
  // animations running forever, including the ones scrolled far off screen.
  const onScreen = useInView(hostRef, { margin: "120px" });
  /** Freeze when the user asked for less motion, or when nobody can see it. */
  const still = reduce || !onScreen;
  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState(0);
  const [poked, setPoked] = useState(false);
  const [spark, setSpark] = useState(false);

  // Blink on a loose, irregular rhythm — a fixed interval reads as mechanical.
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setBlink(true);
          setTimeout(() => setBlink(false), 130);
          schedule();
        },
        2200 + Math.random() * 3600,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [still]);

  // Occasional glance left/right so it never feels frozen.
  useEffect(() => {
    if (still || mood === "sleepy") return;
    const id = setInterval(
      () => setGlance(Math.round((Math.random() - 0.5) * 2 * 2)),
      2600,
    );
    return () => clearInterval(id);
  }, [still, mood]);

  // Every so often Momo does something small and unprompted. A single looping
  // animation reads as a GIF; an occasional unscheduled hop reads as alive.
  useEffect(() => {
    if (still) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setSpark(true);
          setTimeout(() => setSpark(false), 900);
          schedule();
        },
        9000 + Math.random() * 8000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [still]);

  const excitedFace = poked || spark;
  const eyeOpen = mood === "sleepy" && !excitedFace ? 0.28 : blink ? 0.08 : 1;
  const eyeWide =
    mood === "curious" || mood === "excited" || excitedFace ? 1.16 : 1;
  const lookX = mood === "curious" ? 1.5 : mood === "thinking" ? -2.5 : glance;
  const lookY = mood === "curious" ? -1.5 : mood === "thinking" ? -2 : 0;

  const MOTION_BY_MOOD: Record<
    Mood,
    { y: number[]; rotate: number[]; scale: number[] }
  > = {
    idle: { y: [0, -5, 0], rotate: [-1, 1, -1], scale: [1, 1, 1] },
    curious: { y: [0, -3, 0], rotate: [-4, -6, -4], scale: [1, 1, 1] },
    thinking: { y: [0, -2, 0], rotate: [-5, 5, -5], scale: [1, 1, 1] },
    excited: { y: [0, -12, 0], rotate: [0, 0, 0], scale: [1, 1.04, 1] },
    celebrating: { y: [0, -18, 0], rotate: [0, 12, -12], scale: [1, 1.06, 1] },
    caring: { y: [0, -4, 0], rotate: [2, -2, 2], scale: [1, 1, 1] },
    proud: { y: [0, -6, 0], rotate: [0, 0, 0], scale: [1, 1.03, 1] },
    sleepy: { y: [0, -2, 0], rotate: [0, 0, 0], scale: [1, 1, 1] },
  };

  // Reduced motion resolves the same keys to their resting value rather than
  // dropping them, for the same reason.
  const bodyMotion = still
    ? { y: 0, rotate: 0, scale: 1 }
    : MOTION_BY_MOOD[mood];

  const bodyDuration = {
    idle: 4,
    curious: 3,
    thinking: 1.8,
    excited: 0.7,
    celebrating: 1.1,
    caring: 4.5,
    proud: 2.4,
    sleepy: 5.5,
  }[mood];

  return (
    <motion.div
      className={cn(
        "relative select-none",
        interactive && "cursor-pointer",
        className,
      )}
      ref={hostRef}
      style={{ width: size, height: size }}
      aria-hidden
      onPointerDown={interactive ? () => setPoked(true) : undefined}
      animate={
        poked
          ? { scale: [1, 0.84, 1.14, 1], rotate: [0, -10, 9, 0] }
          : spark
            ? { scale: [1, 1.06, 1], rotate: [0, 5, -5, 0] }
            : { scale: 1, rotate: 0 }
      }
      transition={{ duration: poked ? 0.55 : 0.9, ease: "easeInOut" }}
      onAnimationComplete={() => setPoked(false)}
    >
      <motion.svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="overflow-visible"
        initial={{ y: 0, rotate: 0, scale: 1 }}
        animate={bodyMotion}
        transition={{
          duration: bodyDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "60px 100px" }}
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--momo-body-1)" />
            <stop offset="55%" stopColor="var(--momo-body-2)" />
            <stop offset="100%" stopColor="var(--momo-body-3)" />
          </linearGradient>
          <radialGradient id={`${uid}-shine`} cx="35%" cy="26%" r="45%">
            <stop offset="0%" stopColor="#fff" stopOpacity="var(--momo-shine)" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ground shadow — squashes as Momo rises */}
        {shadow ? (
          <motion.ellipse
            cx="60"
            cy="112"
            rx="30"
            ry="6"
            fill="var(--momo-shadow)"
            opacity="var(--momo-shadow-opacity)"
            initial={false}
            animate={still ? { rx: 30 } : { rx: [30, 25, 30] }}
            transition={{
              duration: bodyDuration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ) : null}

        {/* sprout */}
        <g>
          <path
            d="M60 26 C59 19 59 15 60 11"
            stroke="#7FC85C"
            strokeWidth="3.4"
            strokeLinecap="round"
            fill="none"
          />
          <motion.ellipse
            cx="68"
            cy="11"
            rx="9"
            ry="5.5"
            fill="#93D959"
            transform="rotate(-18 68 11)"
            initial={{ rotate: -18 }}
            animate={{ rotate: still ? -18 : [-18, -8, -18] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformOrigin: "60px 12px" }}
          />
          <ellipse
            cx="52"
            cy="14"
            rx="6.5"
            ry="4"
            fill="#AEE47C"
            transform="rotate(16 52 14)"
          />
        </g>

        {/* body */}
        <path d={BODY} fill={`url(#${uid}-body)`} />
        <path d={BODY} fill={`url(#${uid}-shine)`} />

        {/* arms */}
        <motion.ellipse
          cx="13"
          cy="74"
          rx="9.5"
          ry="7"
          fill="var(--momo-body-2)"
          initial={{ rotate: 0, y: 0 }}
          animate={
            !still && (mood === "celebrating" || mood === "excited")
              ? { rotate: [0, -35, 0], y: [0, -8, 0] }
              : !still && mood === "caring"
                ? { rotate: [0, -12, 0], y: [0, 0, 0] }
                : { rotate: 0, y: 0 }
          }
          transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "24px 74px" }}
        />
        <motion.ellipse
          cx="107"
          cy="74"
          rx="9.5"
          ry="7"
          fill="var(--momo-body-2)"
          initial={{ rotate: 0, y: 0 }}
          animate={
            !still && (mood === "celebrating" || mood === "excited")
              ? { rotate: [0, 35, 0], y: [0, -8, 0] }
              : { rotate: 0, y: 0 }
          }
          transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "96px 74px" }}
        />

        {/* cheeks */}
        <ellipse cx="34" cy="78" rx="7" ry="5" fill="#FF9A5C" opacity="0.32" />
        <ellipse cx="86" cy="78" rx="7" ry="5" fill="#FF9A5C" opacity="0.32" />

        {/* eyes */}
        <g transform={`translate(${lookX} ${lookY})`}>
          {[45, 75].map((cx, i) => (
            <g key={cx}>
              <motion.ellipse
                cx={cx}
                cy="64"
                rx={7 * eyeWide}
                ry={9}
                fill="#372B52"
                initial={{ scaleY: 1 }}
                animate={{ scaleY: eyeOpen }}
                transition={{ duration: 0.08 }}
                style={{ transformOrigin: `${cx}px 64px` }}
              />
              {eyeOpen > 0.5 && (
                <>
                  <circle cx={cx + 2.4} cy="60.5" r="2.6" fill="#fff" />
                  <circle
                    cx={cx - 2.2}
                    cy="67"
                    r="1.2"
                    fill="#fff"
                    opacity="0.7"
                  />
                </>
              )}
              {/* squinting happy eye for the biggest moods */}
              {(mood === "celebrating" || mood === "proud") && (
                <path
                  d={`M${cx - 8} 65 Q${cx} ${i === 0 ? 56 : 56} ${cx + 8} 65`}
                  stroke="#372B52"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  fill="none"
                />
              )}
            </g>
          ))}
        </g>

        {/* mouth */}
        <Mouth mood={excitedFace ? "excited" : mood} />
      </motion.svg>

      {!bare && <Props mood={mood} size={size} reduce={still} />}
    </motion.div>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const stroke = "#372B52";
  switch (mood) {
    case "excited":
    case "celebrating":
      return (
        <path
          d="M50 82 Q60 95 70 82 Q60 88 50 82 Z"
          fill="#372B52"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    case "curious":
      return <ellipse cx="60" cy="85" rx="4.5" ry="5.5" fill="#372B52" />;
    case "thinking":
      return (
        <path
          d="M52 85 Q58 81 66 85"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      );
    case "sleepy":
      return (
        <path
          d="M54 85 Q60 89 66 85"
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
      );
    case "caring":
    case "proud":
    case "idle":
    default:
      return (
        <path
          d="M51 82 Q60 91 69 82"
          stroke={stroke}
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />
      );
  }
}

/** Little floating extras that sell the mood. */
function Props({
  mood,
  size,
  reduce,
}: {
  mood: Mood;
  size: number;
  reduce: boolean;
}) {
  const scale = size / 120;
  const s = (n: number) => n * scale;

  if (mood === "thinking") {
    return (
      <>
        <motion.span
          className="absolute text-lg"
          style={{ left: s(94), top: s(6), fontSize: s(26) }}
          animate={
            reduce
              ? { rotate: 0, y: 0 }
              : { rotate: [-12, 12, -12], y: [0, -4, 0] }
          }
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          🔍
        </motion.span>
        {["·", "· ·", "· · ·"].map((dot, i) => (
          <motion.span
            key={i}
            className="absolute font-bold text-[var(--violet)]"
            style={{ left: s(4), top: s(2 + i * 12), fontSize: s(15) }}
            animate={{ opacity: reduce ? 1 : [0.2, 1, 0.2] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: i * 0.25,
            }}
          >
            {dot}
          </motion.span>
        ))}
      </>
    );
  }

  if (mood === "celebrating") {
    return (
      <>
        {["🎉", "✨", "⭐"].map((e, i) => (
          <motion.span
            key={e}
            className="absolute"
            style={{
              left: s([-6, 96, 44][i]),
              top: s([14, 6, -12][i]),
              fontSize: s(22),
            }}
            animate={
              reduce
                ? { y: 0, rotate: 0, scale: 1 }
                : { y: [0, -12, 0], rotate: [0, 18, 0], scale: [0.9, 1.2, 0.9] }
            }
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
          >
            {e}
          </motion.span>
        ))}
      </>
    );
  }

  if (mood === "caring") {
    return (
      <motion.span
        className="absolute"
        style={{ left: s(92), top: s(12), fontSize: s(20) }}
        animate={
          reduce
            ? { y: 0, opacity: 1 }
            : { y: [0, -10, 0], opacity: [0.5, 1, 0.5] }
        }
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        💜
      </motion.span>
    );
  }

  if (mood === "curious") {
    return (
      <motion.span
        className="absolute font-bold text-[var(--violet)]"
        style={{ left: s(96), top: s(8), fontSize: s(24) }}
        animate={
          reduce
            ? { rotate: 0, scale: 1 }
            : { rotate: [-8, 8, -8], scale: [1, 1.15, 1] }
        }
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        ?
      </motion.span>
    );
  }

  if (mood === "sleepy") {
    return (
      <motion.span
        className="absolute text-[var(--ink-soft)]"
        style={{ left: s(94), top: s(10), fontSize: s(18) }}
        animate={
          reduce ? { y: 0, opacity: 1 } : { y: [0, -10, 0], opacity: [0, 1, 0] }
        }
        transition={{ duration: 3, repeat: Infinity }}
      >
        z
      </motion.span>
    );
  }

  return null;
}
