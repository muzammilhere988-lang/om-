import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// Plays once per fresh page load / site open so in-app back navigation stays instant
let hasPlayedOpeningIntro = false;

const INDIA_OUTLINE_PATH =
  'M 139 20 L 185 32 L 231 51 L 229 108 L 213 135 L 255 160 L 242 184 L 278 202 L 314 217 L 362 222 L 390 223 L 400 205 L 405 223 L 453 229 L 462 209 L 495 190 L 527 180 L 560 203 L 542 226 L 520 235 L 509 276 L 486 328 L 475 311 L 468 286 L 451 291 L 448 268 L 425 262 L 422 246 L 404 242 L 392 233 L 390 260 L 388 296 L 405 336 L 378 351 L 351 373 L 325 398 L 301 416 L 275 436 L 259 455 L 248 485 L 246 510 L 242 548 L 228 588 L 211 605 L 195 613 L 181 598 L 170 576 L 156 544 L 144 514 L 132 486 L 126 463 L 116 426 L 107 389 L 104 344 L 100 322 L 94 340 L 74 353 L 50 342 L 37 324 L 57 307 L 40 301 L 22 293 L 46 279 L 76 272 L 66 251 L 61 229 L 65 205 L 92 182 L 126 164 L 139 131 L 154 113 L 129 86 L 124 59 Z';

const INDIA_TRADE_HUBS = [
  { name: 'Delhi NCR', x: 189, y: 193 },
  { name: 'Jaipur', x: 163, y: 228 },
  { name: 'Ahmedabad', x: 104, y: 307 },
  { name: 'Mumbai', x: 109, y: 388 },
  { name: 'Hyderabad', x: 212, y: 423 },
  { name: 'Bengaluru', x: 196, y: 513 },
  { name: 'Chennai', x: 245, y: 511 },
  { name: 'Kolkata', x: 395, y: 316 },
  { name: 'Guwahati', x: 458, y: 243 },
];

const TRADE_ROUTES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [4, 7],
  [0, 7],
  [7, 8],
  [0, 4],
];

export function IndiaOpeningAnimation() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (hasPlayedOpeningIntro) return false;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      hasPlayedOpeningIntro = true;
      return false;
    }
    return true;
  });
  const [zoomingIn, setZoomingIn] = useState(false);

  useEffect(() => {
    if (!visible) return;
    hasPlayedOpeningIntro = true;

    const zoomTimer = window.setTimeout(() => {
      setZoomingIn(true);
    }, 3400);

    const endTimer = window.setTimeout(() => {
      setVisible(false);
    }, 4800);

    return () => {
      window.clearTimeout(zoomTimer);
      window.clearTimeout(endTimer);
    };
  }, [visible]);

  const handleSkip = () => {
    hasPlayedOpeningIntro = true;
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: zoomingIn ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center overflow-hidden select-none"
          role="presentation"
        >
          {/* Subtle cartographic radial atmosphere */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 48%, rgba(20, 184, 166, 0.16) 0%, rgba(15, 23, 42, 0.96) 65%)',
            }}
          />

          {/* Zooming India Map Stage */}
          <motion.div
            initial={{ scale: 0.65, opacity: 0 }}
            animate={
              zoomingIn
                ? { scale: 4.2, opacity: 0 }
                : { scale: 1, opacity: 1 }
            }
            transition={
              zoomingIn
                ? { duration: 1.35, ease: [0.32, 0, 0.2, 1] }
                : { duration: 1.1, ease: [0.16, 1, 0.3, 1] }
            }
            style={{ transformOrigin: '42% 54%' }}
            className="relative w-full max-w-[460px] sm:max-w-[520px] px-4 flex flex-col items-center"
          >
            <svg
              viewBox="0 0 590 640"
              className="w-full h-auto max-h-[68vh] drop-shadow-[0_18px_45px_rgba(13,148,136,0.22)]"
              aria-label="Map of India wholesale trade hubs"
            >
              <defs>
                <linearGradient id="indiaFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(20, 184, 166, 0.24)" />
                  <stop offset="55%" stopColor="rgba(15, 118, 110, 0.16)" />
                  <stop offset="100%" stopColor="rgba(217, 119, 6, 0.18)" />
                </linearGradient>
                <linearGradient id="indiaStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5eead4" />
                  <stop offset="60%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>

              {/* Subtle longitude/latitude reference lines */}
              <g stroke="rgba(148, 163, 184, 0.1)" strokeWidth="1">
                {[120, 240, 360, 480].map((x) => (
                  <line key={`v-${x}`} x1={x} y1={10} x2={x} y2={630} />
                ))}
                {[120, 240, 360, 480].map((y) => (
                  <line key={`h-${y}`} x1={10} y1={y} x2={580} y2={y} />
                ))}
              </g>

              {/* India landmass fill */}
              <motion.path
                d={INDIA_OUTLINE_PATH}
                fill="url(#indiaFillGrad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.45 }}
              />

              {/* Animated drawing outline of India */}
              <motion.path
                d={INDIA_OUTLINE_PATH}
                fill="none"
                stroke="url(#indiaStrokeGrad)"
                strokeWidth="3.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.65, ease: [0.16, 1, 0.3, 1] }}
              />

              {/* Curved inter-city wholesale supply lines */}
              {TRADE_ROUTES.map(([fromIdx, toIdx], idx) => {
                const a = INDIA_TRADE_HUBS[fromIdx];
                const b = INDIA_TRADE_HUBS[toIdx];
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2 - 22;
                return (
                  <motion.path
                    key={`${fromIdx}-${toIdx}`}
                    d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke="rgba(94, 234, 212, 0.48)"
                    strokeWidth="1.7"
                    strokeDasharray="4 4"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.9 }}
                    transition={{
                      duration: 0.85,
                      delay: 1.05 + idx * 0.1,
                      ease: 'easeOut',
                    }}
                  />
                );
              })}

              {/* Trade hub city markers & subtle labels */}
              {INDIA_TRADE_HUBS.map((hub, idx) => (
                <motion.g
                  key={hub.name}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    duration: 0.45,
                    delay: 0.85 + idx * 0.11,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <circle
                    cx={hub.x}
                    cy={hub.y}
                    r="8.5"
                    fill="rgba(45, 212, 191, 0.18)"
                    stroke="rgba(45, 212, 191, 0.65)"
                    strokeWidth="1.2"
                  />
                  <circle cx={hub.x} cy={hub.y} r="3.4" fill="#f59e0b" />
                  <text
                    x={hub.x + 11}
                    y={hub.y + 3}
                    fill="rgba(226, 232, 240, 0.88)"
                    fontSize="10.5"
                    fontWeight="500"
                    fontFamily="var(--font-sans)"
                  >
                    {hub.name}
                  </text>
                </motion.g>
              ))}
            </svg>

            {/* Brand Title Overlay below map */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: zoomingIn ? 0 : 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-4 text-center"
            >
              <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                OM – Open Market
              </p>
              <p className="mt-1 text-xs sm:text-sm text-teal-300 tracking-wide">
                Pan-India B2B Wholesale Trade Network
              </p>
            </motion.div>
          </motion.div>

          <button
            type="button"
            onClick={handleSkip}
            className="absolute bottom-6 right-6 px-4 py-2 text-xs font-medium text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-800 hover:text-white transition-colors"
          >
            Skip Intro →
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
