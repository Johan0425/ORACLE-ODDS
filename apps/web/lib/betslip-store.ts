'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export interface SlipLeg {
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line: number | null;
  odds: number;
  bookmaker: string | null;
  probability: number | null;
  label: string;
  fixtureLabel: string;
  kickoff: string;
  addedAt: string;
}

export const legKey = (l: Pick<SlipLeg, 'fixtureId' | 'marketKey' | 'selectionKey' | 'line'>) => `${l.fixtureId}|${l.marketKey}|${l.selectionKey}|${l.line ?? ''}`;

interface SlipState {
  legs: SlipLeg[];
  stakeUnits: number;
  open: boolean;
  add(leg: Omit<SlipLeg, 'addedAt'>): void;
  remove(key: string): void;
  replace(legs: SlipLeg[]): void;
  clear(): void;
  setStake(u: number): void;
  setOpen(open: boolean): void;
}

/** localStorage puede no existir o lanzar (modo privado): el slip funciona igual en memoria. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* sin persistencia */
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* sin persistencia */
    }
  },
};

export const MAX_LEGS = 15;

export const useBetSlip = create<SlipState>()(
  persist(
    (set, get) => ({
      legs: [],
      stakeUnits: 1,
      open: false,
      add: (leg) => {
        const key = legKey(leg);
        if (get().legs.some((l) => legKey(l) === key) || get().legs.length >= MAX_LEGS) return;
        set({ legs: [...get().legs, { ...leg, addedAt: new Date().toISOString() }], open: true });
      },
      remove: (key) => set({ legs: get().legs.filter((l) => legKey(l) !== key) }),
      replace: (legs) => set({ legs }),
      clear: () => set({ legs: [] }),
      setStake: (u) => set({ stakeUnits: Math.min(100, Math.max(0.1, u)) }),
      setOpen: (open) => set({ open }),
    }),
    { name: 'oo-betslip-v1', storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ legs: s.legs, stakeUnits: s.stakeUnits }) },
  ),
);
