"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adoptSharedSession, restoreWebSession } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { listenToSessionChannel, publishSession } from "@/lib/session-channel";
import { clearSessionMarker } from "@/lib/session-marker";

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

  // Nghe các tab khác suốt vòng đời trang, không chỉ lúc mở: tab kia gia hạn
  // phiên lúc nào thì tab này dùng chung token mới lúc đó, khỏi phải tự đi xoay
  // refresh token thêm một lượt nữa.
  useEffect(
    () =>
      listenToSessionChannel({
        onSession: ({ token, user }) => adoptSharedSession(token, user),
        onAsk: () => {
          const { token, user } = useAuth.getState();
          if (token && user) publishSession(token, user);
        },
        onSignOut: () => {
          useAuth.getState().clear();
          clearSessionMarker();
        },
      }),
    [],
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
