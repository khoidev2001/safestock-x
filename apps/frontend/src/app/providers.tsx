"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }),
  );
  useEffect(
    () =>
      useAuth.subscribe((state, previousState) => {
        const identityChanged = previousState.user?.id !== state.user?.id;
        const sessionCleared =
          (previousState.token || previousState.user) && !state.token && !state.user;
        if (identityChanged || sessionCleared) {
          client.clear();
        }
      }),
    [client],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
