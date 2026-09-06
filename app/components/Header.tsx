"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Seal from "./Seal";
import { SITE_NAME } from "@/app/lib/config";

const NAV = [
  { label: "Administration", href: "#administration" },
  { label: "Briefing Room", href: "#briefing" },
  { label: "Proposals", href: "#proposals" },
  { label: "Submit", href: "#submit" },
  { label: "Archive", href: "#archive" },
];

export default function Header({ phaseLabel }: { phaseLabel?: string }) {
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--deep-navy)", color: "#fff" }}>
      {/* Duyuru seridi */}
      <div
        className="wh-eyebrow text-center py-1.5"
        style={{ background: "var(--red)", color: "#fff", fontSize: 10, letterSpacing: "0.18em" }}
      >
        An official on-chain house of the people · Base · No backend · No servers
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex items-center justify-between py-4 gap-6">
          <a href="#top" className="flex items-center gap-4 shrink-0">
            <Seal size={44} color="#fff" />
            <div className="leading-none">
              <div className="wh-display" style={{ fontSize: 22, letterSpacing: "0.14em" }}>
                {SITE_NAME}
              </div>
              <div className="wh-eyebrow mt-1.5" style={{ color: "var(--amber)", fontSize: 9 }}>
                The People&apos;s House · On Base
              </div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-8">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="wh-eyebrow hover:opacity-70 transition-opacity whitespace-nowrap"
                style={{ color: "#fff" }}
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            {phaseLabel && (
              <span
                className="wh-eyebrow hidden md:inline-flex items-center gap-2 px-3 py-1.5"
                style={{ border: "1px solid rgba(255,255,255,0.25)", fontSize: 10 }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--amber)" }} />
                {phaseLabel}
              </span>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div aria-hidden={!ready} style={!ready ? { opacity: 0, pointerEvents: "none" } : undefined}>
                    {connected ? (
                      <button className="wh-btn wh-btn--light" onClick={openAccountModal} type="button">
                        {account.displayName}
                      </button>
                    ) : (
                      <button className="wh-btn wh-btn--light" onClick={openConnectModal} type="button">
                        Connect wallet
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: "linear-gradient(90deg, var(--red) 0 33%, #fff 33% 66%, var(--navy-accent) 66%)" }} />
    </header>
  );
}
