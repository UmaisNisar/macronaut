"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Momo } from "@/components/mascot/momo";
import { vibrate } from "@/lib/haptics";
import { EASE, SPRING } from "@/lib/motion";

/**
 * One celebration system for the whole app: confetti, a badge, and Momo losing
 * its mind. Call `celebrate()` from anywhere; the overlay is rendered once at
 * the root and cleans itself up.
 */

export type CelebrationRequest = {
  title: string;
  detail?: string;
  emoji?: string;
  /** Small burst for routine wins, big for milestones. */
  intensity?: "small" | "big";
};

type Ctx = { celebrate: (request: CelebrationRequest) => void };

const CelebrationContext = createContext<Ctx>({ celebrate: () => {} });

export const useCelebration = () => useContext(CelebrationContext);

const COLORS = [
  "#7B61FF",
  "#FFB627",
  "#A98BFF",
  "#2FC79A",
  "#4FB8FF",
  "#FF9A5C",
  "#86D14F",
];

type Piece = {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
  drift: number;
  size: number;
  round: boolean;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.35,
    duration: 1.9 + Math.random() * 1.4,
    color: COLORS[i % COLORS.length],
    rotate: (Math.random() - 0.5) * 900,
    drift: (Math.random() - 0.5) * 160,
    size: 7 + Math.random() * 9,
    round: Math.random() > 0.55,
  }));
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<CelebrationRequest | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion();

  const celebrate = useCallback(
    (request: CelebrationRequest) => {
      setActive(request);
      // An outcome rather than a tap, so this is the Vibration API only:
      // iOS cannot fire a tick without a finger on a switch.
      vibrate("success");
      setPieces(reduce ? [] : makePieces(request.intensity === "big" ? 54 : 30));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => setActive(null),
        request.intensity === "big" ? 3600 : 2600,
      );
    },
    [reduce],
  );

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <CelebrationContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {active ? (
          <div
            className="pointer-events-none fixed inset-0 z-[120] overflow-hidden"
            role="status"
            aria-live="polite"
          >
            {/* confetti */}
            {pieces.map((p) => (
              <motion.span
                key={p.id}
                className="absolute top-0"
                style={{
                  left: `${p.x}%`,
                  width: p.size,
                  height: p.round ? p.size : p.size * 0.55,
                  background: p.color,
                  borderRadius: p.round ? "999px" : "2px",
                }}
                initial={{ y: -40, opacity: 0, rotate: 0 }}
                animate={{
                  y: "105vh",
                  x: p.drift,
                  rotate: p.rotate,
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: "easeIn",
                  opacity: { times: [0, 0.1, 0.75, 1], duration: p.duration },
                }}
              />
            ))}

            {/* badge */}
            <div className="absolute inset-0 grid place-items-center px-6">
              <motion.div
                initial={{ scale: 0.4, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, y: -10 }}
                transition={SPRING.pop}
                className="sticker tint-sun flex max-w-sm flex-col items-center px-8 py-7 text-center"
              >
                <Momo mood="celebrating" size={104} />
                {active.emoji ? (
                  <motion.span
                    className="mt-1 text-4xl"
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ ...SPRING.pop, delay: 0.15 }}
                  >
                    {active.emoji}
                  </motion.span>
                ) : null}
                <motion.h2
                  className="mt-2 text-xl font-bold text-balance"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, ease: EASE.glide }}
                >
                  {active.title}
                </motion.h2>
                {active.detail ? (
                  <motion.p
                    className="mt-1.5 text-sm text-pretty text-[var(--ink-soft)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {active.detail}
                  </motion.p>
                ) : null}
              </motion.div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </CelebrationContext.Provider>
  );
}
