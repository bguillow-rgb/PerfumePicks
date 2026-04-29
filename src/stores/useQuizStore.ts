import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';

/**
 * Persisted store for quiz answers.
 *
 * Persisting answers survives app kills, background-eviction, and paywall
 * intercepts mid-quiz. The rec engine reads `answers` directly to
 * incorporate taste signals even when the quiz wasn't finished in one sitting.
 */
interface QuizState {
  answers: Record<string, string>;
  setAnswer: (questionId: string, optionId: string) => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      answers: {},
      setAnswer: (questionId, optionId) =>
        set((s) => ({ answers: { ...s.answers, [questionId]: optionId } })),
      reset: () => set({ answers: {} }),
    }),
    {
      name: STORAGE_KEYS.quiz,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ answers: s.answers }),
    },
  ),
);
