"use client";

import { useEffect, useState } from "react";

import { getCurrentUser, type SessionUser } from "./session";

export type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "ready"; user: SessionUser };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (cancelled) return;
      setState(user ? { status: "ready", user } : { status: "anonymous" });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
