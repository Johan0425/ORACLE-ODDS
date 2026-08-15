'use client';

import { useRef, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ProbabilityGauge } from './ProbabilityGauge';
import { cn } from '@/lib/cn';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface MatchCardProps {
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  kickoff: string;
  market: string;
  selection: string;
  probability: number;
  confidence: ConfidenceLevel;
  edge?: number | null;
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-neon/15 text-neon border-neon/30',
  medium: 'bg-gold/15 text-gold border-gold/30',
  low: 'bg-white/10 text-white/60 border-white/15',
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'Confianza alta',
  medium: 'Confianza media',
  low: 'Confianza baja',
};

export function MatchCard({
  homeTeam,
  awayTeam,
  leagueName,
  kickoff,
  market,
  selection,
  probability,
  confidence,
  edge,
}: MatchCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), { stiffness: 220, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), { stiffness: 220, damping: 20 });

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = cardRef.current?.getBoundingClientRect();
    if (!bounds) return;
    mouseX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    mouseY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      whileHover={{ scale: 1.02 }}
      className="group relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{leagueName}</span>
        <span>{kickoff}</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <TeamLabel name={homeTeam} />
        <span className="text-xs font-medium uppercase tracking-widest text-white/30">vs</span>
        <TeamLabel name={awayTeam} align="right" />
      </div>

      <div className="mt-6 flex items-center gap-4">
        <ProbabilityGauge probability={probability} />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {market} · {selection}
          </p>
          <p className="mt-1 font-display text-3xl font-bold text-foreground">{Math.round(probability * 100)}%</p>
          {typeof edge === 'number' && edge > 0 && (
            <p className="mt-1 text-xs font-medium text-neon">+{Math.round(edge * 100)}% vs. mercado</p>
          )}
        </div>
      </div>

      <span
        className={cn(
          'mt-5 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
          CONFIDENCE_STYLES[confidence],
        )}
      >
        {CONFIDENCE_LABEL[confidence]}
      </span>
    </motion.div>
  );
}

function TeamLabel({ name, align = 'left' }: { name: string; align?: 'left' | 'right' }) {
  return (
    <span
      className={cn('flex-1 truncate text-sm font-semibold text-foreground', align === 'right' && 'text-right')}
    >
      {name}
    </span>
  );
}
