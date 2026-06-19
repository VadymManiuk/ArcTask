"use client";

import { useEffect, useState } from "react";
import { getState, subscribeToState } from "@/lib/store";
import { seedState } from "@/lib/mock-data";

export function useArcTaskState() {
  const [state, setState] = useState(seedState);

  useEffect(() => {
    setState(getState());
    return subscribeToState(() => setState(getState()));
  }, []);

  return state;
}
