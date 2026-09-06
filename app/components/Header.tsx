"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Seal from "./Seal";

const NAV = [
  { label: "Briefing Room", href: "#briefing" },
  { label: "Proposals", href: "#proposals" },
  { label: "Submit", href: "#submit" },
  { label: "Treasury", href: "#administration" },
  { label: "Archive", href: "#archive" },
];

const TICKER =
  "The People's House · On Base · No backend · No servers · Every proposal is a transaction · Every vote is a transaction →";

export default function Header({ phaseLabel }: { phaseLabel?: string }) {
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--navy)", color: "#fff" }}>
      {/* Ust serit: wh.gov'daki kayan beyaz duyuru */}
      <div className="ticker" style={{ background: "#fff", padding: "6px 0" }}>
        <div className="ticker-track">
          {TICKER}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{TICKER}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{TICKER}
        </div>
      </div>

      {/* Orta satir: sol menu, orta logo, sag cuzdan */}
      <div className="wrap" style={{ maxWidth: 1320 }}>
        <div className="grid grid-cols-3 items-center" style={{ height: 64 }}>
          <div className="flex items-center gap-3">
            <span className="nav-link hidden sm:inline-flex items-center gap-2">
              <span className="inline-block" style={{ width: 14 }}>
                <span className="block h-px bg-white mb-1" />
                <span className="block h-px bg-white mb-1" />
                <span className="block h-px bg-white" />
              </span>
              Menu
            </span>
          </div>

          <a href="#top" className="flex flex-col items-center justify-center gap-1 leading-none">
            <Seal size={34} color="#fff" />
            <span className="serif" style={{ color: "#fff", fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              De White House
            </span>
            <span className="mono" style={{ fontSize: 7.5, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.7 }}>
              On Base
            </span>
          </a>

          <div className="flex items-center justify-end gap-5">
            {phaseLabel && (
              <span className="meta hidden md:inline" style={{ color: "rgba(255,255,255,0.6)" }}>
                {phaseLabel}
              </span>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <div aria-hidden={!mounted} style={!mounted ? { opacity: 0, pointerEvents: "none" } : undefined}>
                    <button
                      className="nav-link"
                      type="button"
                      onClick={connected ? openAccountModal : openConnectModal}
                      style={{ background: "none", border: 0, padding: 0 }}
                    >
                      {connected ? account.displayName : "Connect"}
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>

      {/* Alt satir: nav */}
      <div style={{ borderTop: "1px solid var(--hair-light)" }}>
        <nav className="flex items-center justify-center gap-9 overflow-x-auto px-6" style={{ height: 40 }}>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="nav-link">
              {n.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
