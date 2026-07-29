"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { restoreWebSession } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }),
  );
  const setHasHydrated = useAuth((state) => state.setHasHydrated);

  useEffect(() => {
    let active = true;
    void restoreWebSession().finally(() => {
      if (active) setHasHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [setHasHydrated]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
