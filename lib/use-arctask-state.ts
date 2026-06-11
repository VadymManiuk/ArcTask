"use client";

import { useSyncExternalStore } from "react";
import { getState, subscribeToState } from "@/lib/store";
import { seedState } from "@/lib/mock-data";

export function useArcTaskState() {
  return useSyncExternalStore(subscribeToState, getState, () => seedState);
}
