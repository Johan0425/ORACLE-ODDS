'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

const SIZE = 64;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function gaugeColorClass(probability: number): string {
  if (probability >= 0.66) return 'text-neon';
  if (probability >= 0.33) return 'text-gold';
  return 'text-white/40';
}

export function ProbabilityGauge({ probability }: { probability: number }) {
  const offset = CIRCUMFERENCE * (1 - probability);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke="currentColor"
        strokeWidth={STROKE}
        fill="none"
        className="text-white/10"
      />
      <motion.circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
        className={cn(gaugeColorClass(probability))}
        strokeDasharray={CIRCUMFERENCE}
        initial={{ strokeDashoffset: CIRCUMFERENCE }}
        whileInView={{ strokeDashoffset: offset }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
}
