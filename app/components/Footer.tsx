import Seal from "./Seal";
import { CONTRACT_ADDR, COLLECTION_ADDR, IS_DEPLOYED } from "@/app/lib/config";

const TICKER =
  "The People's House · On Base · No backend · No servers · Every proposal is a transaction · Every vote is a transaction →";

export default function Footer() {
  return (
    <footer style={{ background: "var(--navy)", color: "#fff" }}>
      <div className="wrap py-20 flex flex-col items-center text-center">
        <Seal size={44} color="#fff" />
        <p className="serif mt-4" style={{ color: "#fff", fontSize: 18, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          De White House
        </p>
        <p className="mono mt-1" style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.6 }}>
          On Base
        </p>

        <nav className="mt-12 flex flex-wrap justify-center gap-x-9 gap-y-3">
          <a className="nav-link" href={IS_DEPLOYED ? `https://basescan.org/address/${CONTRACT_ADDR}` : "#administration"} target={IS_DEPLOYED ? "_blank" : undefined} rel="noopener noreferrer">
            House contract
          </a>
          <a className="nav-link" href={`https://basescan.org/address/${COLLECTION_ADDR}`} target="_blank" rel="noopener noreferrer">
            VRNouns
          </a>
          <a className="nav-link" href="https://github.com/omgbbqhaxx/dewhitehouse" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a className="nav-link" href="https://flooor.fun" target="_blank" rel="noopener noreferrer">
            flooor.fun
          </a>
          <a className="nav-link" href="https://prop.house" target="_blank" rel="noopener noreferrer">
            Prop House
          </a>
        </nav>

        <p className="mt-12 max-w-md text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
          Proposals are written by holders, decided by holders and paid from a treasury that lives in a
          contract. If this page disappears, the House still stands.
        </p>
      </div>
      <div className="ticker" style={{ background: "#fff", padding: "6px 0" }}>
        <div className="ticker-track">
          {TICKER}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{TICKER}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{TICKER}
        </div>
      </div>
      <div className="wrap py-4 text-center meta" style={{ color: "rgba(255,255,255,0.4)" }}>
        Not affiliated with any government · Static site · No backend
      </div>
    </footer>
  );
}
