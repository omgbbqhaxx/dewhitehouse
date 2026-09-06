import Seal from "./Seal";
import { SITE_NAME, CONTRACT_ADDR, COLLECTION_ADDR, IS_DEPLOYED } from "@/app/lib/config";

const link = "hover:opacity-70 transition-opacity";

export default function Footer() {
  return (
    <footer style={{ background: "var(--deep-navy)", color: "#fff" }} className="mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-2">
          <div className="flex items-center gap-4">
            <Seal size={48} color="#fff" />
            <div className="wh-display" style={{ fontSize: 20, letterSpacing: "0.14em" }}>
              {SITE_NAME}
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed max-w-md" style={{ color: "var(--pale-gray)" }}>
            Proposals are written by holders, decided by holders, and paid from a treasury that lives in a
            contract. There is no server to switch off and no database to edit. If this page disappears,
            the House still stands on Base.
          </p>
        </div>

        <div>
          <p className="wh-eyebrow" style={{ color: "var(--amber)" }}>On-chain</p>
          <div className="mt-4 flex flex-col gap-2.5 text-sm">
            <a
              className={link}
              href={IS_DEPLOYED ? `https://basescan.org/address/${CONTRACT_ADDR}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              House contract
            </a>
            <a
              className={link}
              href={`https://basescan.org/address/${COLLECTION_ADDR}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              VRNouns collection
            </a>
            <a className={link} href="https://base.org" target="_blank" rel="noopener noreferrer">
              Base
            </a>
          </div>
        </div>

        <div>
          <p className="wh-eyebrow" style={{ color: "var(--amber)" }}>Source</p>
          <div className="mt-4 flex flex-col gap-2.5 text-sm">
            <a className={link} href="https://github.com/omgbbqhaxx/dewhitehouse" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className={link} href="https://flooor.fun" target="_blank" rel="noopener noreferrer">
              flooor.fun
            </a>
            <a className={link} href="https://prop.house" target="_blank" rel="noopener noreferrer">
              Prop House (inspiration)
            </a>
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 flex flex-col sm:flex-row justify-between gap-2 wh-eyebrow" style={{ color: "var(--gray)", fontSize: 10 }}>
          <span>{SITE_NAME} · Not affiliated with any government.</span>
          <span>Backend-less · Static site · Every vote is a transaction.</span>
        </div>
      </div>
    </footer>
  );
}
