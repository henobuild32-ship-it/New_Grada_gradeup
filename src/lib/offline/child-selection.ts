'use client';

import { useCallback, useSyncExternalStore } from 'react';

const EMPTY_SELECTION = '';
const CHANGE_EVENT = 'gradeup-child-selection';

/** Préférence parent-enfant partagée par les écrans parent, SSR-safe. */
export function usePersistedChildSelection(parentId: string, childIds: string[]) {
  const storageKey = parentId ? `gradeup:selected-child:${parentId}` : '';
  const subscribe = useCallback((onChange: () => void) => {
    if (!storageKey || typeof window === 'undefined') return () => {};
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) onChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [storageKey]);
  const getSnapshot = useCallback(() => {
    if (!storageKey || typeof window === 'undefined') return EMPTY_SELECTION;
    try {
      return window.localStorage.getItem(storageKey) || EMPTY_SELECTION;
    } catch {
      return EMPTY_SELECTION;
    }
  }, [storageKey]);
  const savedId = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SELECTION);
  const selectedChildId = childIds.includes(savedId) ? savedId : childIds[0] || '';
  const selectChild = useCallback((childId: string) => {
    if (!storageKey || !childIds.includes(childId)) return;
    try {
      window.localStorage.setItem(storageKey, childId);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // La sélection ne peut être mémorisée si le stockage est bloqué.
    }
  }, [childIds, storageKey]);

  return { selectedChildId, selectChild };
}
