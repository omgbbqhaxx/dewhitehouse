"use client";

import type { ReactNode } from "react";
import { base } from "wagmi/chains";
import { WagmiProvider, http, fallback, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets, lightTheme } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  baseAccount,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";
import { SITE_NAME, SITE_URL } from "@/app/lib/config";

const customRpc = process.env.NEXT_PUBLIC_BASE_RPC;
const transports = fallback(
  [customRpc ? http(customRpc) : undefined, http("https://mainnet.base.org"), http()].filter(
    Boolean,
  ) as ReturnType<typeof http>[],
);

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [metaMaskWallet, baseAccount, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: SITE_NAME, projectId },
);

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: { [base.id]: transports },
  batch: { multicall: { wait: 16 } },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={base}
          theme={lightTheme({
            accentColor: "#0D132D",
            accentColorForeground: "#FFFFFF",
            borderRadius: "none",
            fontStack: "system",
          })}
          appInfo={{ appName: SITE_NAME, learnMoreUrl: SITE_URL }}
        >
          <Toaster position="top-right" richColors closeButton />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
