"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { readContract, writeContract } from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther, type Address } from "viem";
import { toast } from "sonner";

import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { DEWHITEHOUSE_ABI, Phase, NUM_WINNERS, PROPOSING_LENGTH, ROUND_LENGTH } from "@/app/abi/dewhitehouse";
import { NFT_ABI } from "@/app/abi/nft";
import { CONTRACT_ADDR, COLLECTION_ADDR, IS_DEPLOYED } from "@/app/lib/config";
import { awaitTx } from "@/app/lib/awaitTx";
import { describeRevert, isUserRejected } from "@/app/lib/errors";
import { countdown, eth, fmtDate, isSameAddr, shortAddr } from "@/app/lib/format";

// ---------------------------------------------------------------------------
// Tipler ve yardimcilar
// ---------------------------------------------------------------------------
type Proposal = {
  id: bigint;
  roundId: bigint;
  proposer: Address;
  title: string;
  tldr: string;
  body: string;
  votes: bigint;
  createdAt: bigint;
  won: boolean;
};

type RoundInfo = { id: number; budget: bigint; count: number; finalized: boolean };

const nowSec = () => Math.floor(Date.now() / 1000);
const roundOf = (t: number) => Math.floor(t / ROUND_LENGTH);
const startOf = (id: number) => id * ROUND_LENGTH;
const proposingEndOf = (id: number) => id * ROUND_LENGTH + PROPOSING_LENGTH;
const votingEndOf = (id: number) => (id + 1) * ROUND_LENGTH;

const phaseOf = (id: number, t: number, finalized: boolean): Phase => {
  if (finalized) return Phase.Finalized;
  if (t < proposingEndOf(id)) return Phase.Proposing;
  if (t < votingEndOf(id)) return Phase.Voting;
  return Phase.Ended;
};

const PHASE_LABEL: Record<Phase, string> = {
  [Phase.Proposing]: "Proposing",
  [Phase.Voting]: "Voting",
  [Phase.Ended]: "Awaiting results",
  [Phase.Finalized]: "Concluded",
};

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------
export default function HomePage() {
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [now, setNow] = useState(nowSec());
  const [selectedId, setSelectedId] = useState<number>(roundOf(nowSec()));
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [archive, setArchive] = useState<RoundInfo[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const [votingPower, setVotingPower] = useState<bigint>(0n);
  const [votesLeft, setVotesLeft] = useState<bigint>(0n);
  const [hasProposed, setHasProposed] = useState(false);
  const [pendingOwed, setPendingOwed] = useState<bigint>(0n);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(nowSec()), 1000);
    return () => clearInterval(t);
  }, []);

  const currentId = roundOf(now);
  const isCurrent = selectedId === currentId;
  const phase = phaseOf(selectedId, now, round?.finalized ?? false);

  // -------------------------------------------------------------------------
  // Zincirden okuma
  // -------------------------------------------------------------------------
  const rc = useCallback(
    <T,>(functionName: string, args: unknown[] = []) =>
      readContract(config, {
        address: CONTRACT_ADDR,
        abi: DEWHITEHOUSE_ABI,
        functionName: functionName as never,
        args: args as never,
        chainId: base.id,
      }) as Promise<T>,
    [config],
  );

  const loadRound = useCallback(async () => {
    if (!IS_DEPLOYED) {
      setLoading(false);
      return;
    }
    try {
      const [b, c, f, list] = await Promise.all([
        rc<bigint>("budget", [BigInt(selectedId)]),
        rc<bigint>("roundProposalCount", [BigInt(selectedId)]),
        rc<boolean>("finalized", [BigInt(selectedId)]),
        rc<readonly Proposal[]>("getRoundProposals", [BigInt(selectedId)]),
      ]);
      setRound({ id: selectedId, budget: b, count: Number(c), finalized: f });
      setProposals([...list]);
    } catch (e) {
      console.error("loadRound", e);
    } finally {
      setLoading(false);
    }
  }, [rc, selectedId]);

  const loadArchive = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const ids = await rc<readonly bigint[]>("touchedRounds");
      const recent = [...ids].map(Number).sort((a, b) => b - a).slice(0, 30);
      const rows = await Promise.all(
        recent.map(async (id) => {
          const [b, c, f] = await Promise.all([
            rc<bigint>("budget", [BigInt(id)]),
            rc<bigint>("roundProposalCount", [BigInt(id)]),
            rc<boolean>("finalized", [BigInt(id)]),
          ]);
          return { id, budget: b, count: Number(c), finalized: f } as RoundInfo;
        }),
      );
      setArchive(rows);
    } catch (e) {
      console.error("loadArchive", e);
    }
  }, [rc]);

  const loadUser = useCallback(async () => {
    if (!address) {
      setVotingPower(0n);
      setVotesLeft(0n);
      setHasProposed(false);
      return;
    }
    try {
      const power = await readContract(config, {
        address: COLLECTION_ADDR,
        abi: NFT_ABI,
        functionName: "balanceOf",
        args: [address],
        chainId: base.id,
      });
      setVotingPower(power);
      if (IS_DEPLOYED) {
        const [left, proposed, owed] = await Promise.all([
          rc<bigint>("votesRemaining", [BigInt(selectedId), address]),
          rc<boolean>("hasProposed", [BigInt(selectedId), address]),
          rc<bigint>("pendingWithdrawals", [address]),
        ]);
        setVotesLeft(left);
        setHasProposed(proposed);
        setPendingOwed(owed);
      }
    } catch (e) {
      console.error("loadUser", e);
    }
  }, [config, rc, address, selectedId]);

  useEffect(() => {
    loadRound();
    const t = setInterval(loadRound, 20_000);
    return () => clearInterval(t);
  }, [loadRound]);

  useEffect(() => {
    loadArchive();
    const t = setInterval(loadArchive, 60_000);
    return () => clearInterval(t);
  }, [loadArchive]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRound(), loadArchive(), loadUser()]);
  }, [loadRound, loadArchive, loadUser]);

  // -------------------------------------------------------------------------
  // Yazma
  // -------------------------------------------------------------------------
  const runTx = async (key: string, fn: () => Promise<`0x${string}`>, successMsg: string) => {
    if (!isConnected) {
      toast.error("Connect a wallet first.");
      return false;
    }
    setBusy(key);
    try {
      if (chainId !== base.id) await switchChainAsync({ chainId: base.id });
      const hash = await fn();
      const ok = await awaitTx(config, hash, base.id);
      if (ok) {
        toast.success(successMsg);
        await refreshAll();
      }
      return ok;
    } catch (e) {
      if (!isUserRejected(e)) toast.error(describeRevert(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const wc = (functionName: string, args: unknown[], value?: bigint) =>
    writeContract(config, {
      address: CONTRACT_ADDR,
      abi: DEWHITEHOUSE_ABI,
      functionName: functionName as never,
      args: args as never,
      value,
      chainId: base.id,
    });

  const submitProposal = (title: string, tldr: string, body: string) =>
    runTx("propose", () => wc("propose", [title, tldr, body]), "Your proposal is on the record.");

  const castVote = (proposalId: bigint, weight: bigint) =>
    runTx(`vote-${proposalId}`, () => wc("vote", [proposalId, weight]), "Vote recorded on Base.");

  const settleRound = () =>
    runTx("settle", () => wc("settle", [BigInt(selectedId)]), "Round settled. Winners have been paid.");

  const withdrawPending = () =>
    runTx("withdraw", () => wc("withdraw", []), "Withdrawn.");

  const fundRound = (amountEth: string) =>
    runTx("fund", () => wc("fund", [BigInt(currentId)], parseEther(amountEth)), "Treasury topped up.");

  // -------------------------------------------------------------------------
  // Turetilmis
  // -------------------------------------------------------------------------
  const sorted = useMemo(() => {
    const list = [...proposals];
    if (phase === Phase.Proposing) return list.sort((a, b) => Number(a.id - b.id));
    return list.sort((a, b) => (b.votes === a.votes ? Number(a.id - b.id) : b.votes > a.votes ? 1 : -1));
  }, [proposals, phase]);

  const maxVotes = useMemo(() => proposals.reduce((m, p) => (p.votes > m ? p.votes : m), 0n), [proposals]);

  const deadline =
    phase === Phase.Proposing ? proposingEndOf(selectedId) : phase === Phase.Voting ? votingEndOf(selectedId) : null;

  const headerPhase = !IS_DEPLOYED
    ? "Not deployed"
    : `Round ${selectedId} · ${PHASE_LABEL[phase]}${deadline ? ` · ${countdown(deadline, now)}` : ""}`;

  const canPropose = IS_DEPLOYED && isCurrent && phase === Phase.Proposing && isConnected && votingPower > 0n && !hasProposed;
  const proposeReason = !IS_DEPLOYED
    ? "The House contract is not deployed yet."
    : !isCurrent
      ? "Proposals can only be submitted to the current round."
      : phase !== Phase.Proposing
        ? "The proposing period has closed for today. It reopens at the start of the next round."
        : !isConnected
          ? "Connect a wallet holding VRNouns to submit."
          : votingPower === 0n
            ? "This wallet holds no VRNouns."
            : hasProposed
              ? "This wallet has already submitted a proposal in this round."
              : undefined;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div id="top">
      <Header phaseLabel={headerPhase} />

      {/* ---- Sayfa basligi (beyaz) ---- */}
      <section className="band" style={{ paddingBottom: 72 }}>
        <div className="wrap fade">
          <h1 className="serif t-page">The People&apos;s House</h1>
          <p className="t-lede col-text mt-7">
            Any VRNouns holder may bring a proposal before the House. Holders vote. The treasury pays the
            winners. There is no committee, no clerk and no server in between: the whole process is a contract
            on Base. A new round opens every day.
          </p>

          {!IS_DEPLOYED && (
            <p className="meta mt-8" style={{ color: "var(--red)" }}>
              Notice · The House contract is not deployed yet. Reads and writes are disabled.
            </p>
          )}

          {/* Ozet tablo — wh.gov'daki belge izgarasi gibi */}
          <div className="grid-table mt-12 grid-cols-2 md:grid-cols-4">
            <Cell k="Round" v={`No. ${selectedId}`} s={isCurrent ? "Today" : fmtDate(startOf(selectedId))} />
            <Cell k="Phase" v={PHASE_LABEL[phase]} s={deadline ? `${countdown(deadline, now)} left` : phase === Phase.Ended ? "Ready to conclude" : "Sealed"} />
            <Cell k="Treasury" v={round ? eth(round.budget) : "—"} s={round?.finalized ? "Distributed" : `Split among ${NUM_WINNERS} winners`} />
            <Cell
              k="Your votes"
              v={isConnected ? `${votesLeft.toString()} of ${votingPower.toString()}` : "—"}
              s={isConnected ? (votingPower > 0n ? "1 VRNouns = 1 vote" : "No VRNouns in wallet") : "Connect to see"}
            />
          </div>
        </div>
      </section>

      {/* ---- Briefing Room (tas) ---- */}
      <section id="briefing" className="band band-stone">
        <div className="wrap">
          <p className="eyebrow">
            <span className="sec">§</span> Briefing Room
          </p>
          <div className="grid md:grid-cols-12 gap-10 mt-10">
            <div className="md:col-span-5">
              <h2 className="serif t-section">How a day in the House works</h2>
              {!isCurrent && (
                <button className="btn btn-outline btn-sm mt-8" onClick={() => setSelectedId(currentId)}>
                  Back to today
                </button>
              )}
            </div>
            <div className="md:col-span-7">
              <Timeline id={selectedId} phase={phase} now={now} />
              <div className="row-list mt-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
                <p className="py-4"><span className="serif" style={{ fontSize: 20 }}>1.</span>&nbsp; Rounds are numbered by the clock. Each one lasts 24 hours, starting at midnight UTC.</p>
                <p className="py-4"><span className="serif" style={{ fontSize: 20 }}>2.</span>&nbsp; For the first sixteen hours, any holder may submit one proposal. The full text is stored on Base.</p>
                <p className="py-4"><span className="serif" style={{ fontSize: 20 }}>3.</span>&nbsp; For the last eight hours, holders split their votes across proposals. One VRNouns equals one vote.</p>
                <p className="py-4"><span className="serif" style={{ fontSize: 20 }}>4.</span>&nbsp; When the round ends, the next write to the House settles it automatically. The contract ranks proposals, pays the top three directly and rolls what is left into the next round. Nobody has to claim.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Proposals (beyaz) ---- */}
      <section id="proposals" className="band">
        <div className="wrap">
          <p className="eyebrow">
            <span className="sec">§</span> The Docket
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4 mt-10">
            <h2 className="serif t-section">Proposals before the House</h2>
            {phase === Phase.Voting && isConnected && (
              <span className="meta">{votesLeft.toString()} vote{votesLeft === 1n ? "" : "s"} remaining</span>
            )}
          </div>

          {loading ? (
            <p className="meta mt-10">Reading the House from Base…</p>
          ) : sorted.length === 0 ? (
            <p className="t-lede mt-10 col-text" style={{ color: "var(--gray)" }}>
              {phase === Phase.Proposing && isCurrent
                ? "The docket is empty. Be the first to bring a proposal before the House today."
                : "No proposals were submitted in this round."}
            </p>
          ) : (
            <div className="row-list mt-10">
              {sorted.map((p, i) => (
                <ProposalRow
                  key={p.id.toString()}
                  p={p}
                  rank={i + 1}
                  phase={phase}
                  maxVotes={maxVotes}
                  votesLeft={votesLeft}
                  canVote={phase === Phase.Voting && isConnected && votesLeft > 0n}
                  busy={busy === `vote-${p.id}`}
                  onVote={(w) => castVote(p.id, w)}
                  isYou={isSameAddr(address, p.proposer)}
                />
              ))}
            </div>
          )}

          {IS_DEPLOYED && phase === Phase.Ended && (
            <div className="mt-12 flex flex-wrap items-center justify-between gap-6 py-6" style={{ borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
              <div>
                <p className="serif t-item">Voting has closed</p>
                <p className="mt-1 text-sm" style={{ color: "var(--gray)" }}>
                  This round settles itself the moment anyone writes to the House. You may also settle it now.
                </p>
              </div>
              <button className="btn btn-outline" disabled={busy !== null} onClick={settleRound}>
                {busy === "settle" ? "Settling…" : "Settle now"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ---- Submit (tas) ---- */}
      <section id="submit" className="band band-stone">
        <div className="wrap">
          <p className="eyebrow">
            <span className="sec">§</span> Petition the House
          </p>
          <div className="grid md:grid-cols-12 gap-10 mt-10">
            <div className="md:col-span-5">
              <h2 className="serif t-section">Submit a proposal</h2>
              <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
                One proposal per wallet per round. What you sign is what is published. There is no draft, no
                review and no edit. Longer text costs more gas.
              </p>
            </div>
            <div className="md:col-span-7">
              <ProposalForm enabled={canPropose} reason={proposeReason} busy={busy === "propose"} onSubmit={submitProposal} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Treasury (beyaz) ---- */}
      <section id="administration" className="band">
        <div className="wrap">
          <p className="eyebrow">
            <span className="sec">§</span> The Treasury
          </p>
          <div className="grid md:grid-cols-12 gap-10 mt-10">
            <div className="md:col-span-5">
              <h2 className="serif t-section">There is no administration</h2>
            </div>
            <div className="md:col-span-7">
              <p className="t-lede">
                Nobody owns the House. Nobody opens rounds, edits proposals, changes votes or picks winners.
                The treasury is whatever anyone chooses to put in it. Send ETH to the contract and it lands in
                today&apos;s round. Winners are paid the moment the round settles. What they do not take rolls
                into tomorrow.
              </p>
              <div className="grid-table mt-10 grid-cols-2">
                <Cell k="Today's treasury" v={isCurrent && round ? eth(round.budget) : "—"} s={`Round ${currentId}`} />
                <Cell k="Contract" v={IS_DEPLOYED ? shortAddr(CONTRACT_ADDR) : "Not deployed"} s="Base mainnet" />
              </div>
              {IS_DEPLOYED && <FundForm busy={busy === "fund"} onFund={fundRound} />}
              {pendingOwed > 0n && (
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 py-5" style={{ borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
                  <div>
                    <p className="serif t-item">{eth(pendingOwed)} is waiting for you</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--gray)" }}>A direct payment to this wallet did not go through. Withdraw it here.</p>
                  </div>
                  <button className="btn btn-red" disabled={busy !== null} onClick={withdrawPending}>
                    {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---- Archive (tas) ---- */}
      <section id="archive" className="band band-stone">
        <div className="wrap">
          <p className="eyebrow">
            <span className="sec">§</span> Records
          </p>
          <h2 className="serif t-section mt-10">Archive of rounds</h2>
          {archive.length === 0 ? (
            <p className="t-lede mt-8" style={{ color: "var(--gray)" }}>No rounds on record yet.</p>
          ) : (
            <div className="row-list mt-8">
              {archive.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="w-full text-left py-5 grid grid-cols-[80px_1fr_auto_auto] gap-6 items-center hover:opacity-70 transition-opacity"
                >
                  <span className="meta" style={{ color: "var(--ink)" }}>No. {r.id}</span>
                  <span className="serif" style={{ fontSize: 20 }}>{fmtDate(startOf(r.id)).split(",").slice(0, 2).join(",")}</span>
                  <span className="meta">{r.count} proposal{r.count === 1 ? "" : "s"} · {eth(r.budget, 3)}</span>
                  <span className="meta" style={{ color: r.finalized ? "var(--ink)" : "var(--gray)" }}>
                    {PHASE_LABEL[phaseOf(r.id, now, r.finalized)]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parcalar
// ---------------------------------------------------------------------------
function Cell({ k, v, s }: { k: string; v: string; s?: string }) {
  return (
    <div>
      <p className="meta">{k}</p>
      <p className="serif mt-2" style={{ fontSize: 24, lineHeight: 1.1 }}>{v}</p>
      {s && <p className="mt-1 text-xs" style={{ color: "var(--gray)" }}>{s}</p>}
    </div>
  );
}

function Timeline({ id, phase, now }: { id: number; phase: Phase; now: number }) {
  const steps = [
    { label: "Proposing", from: startOf(id), to: proposingEndOf(id), key: Phase.Proposing },
    { label: "Voting", from: proposingEndOf(id), to: votingEndOf(id), key: Phase.Voting },
    { label: "Results", from: votingEndOf(id), to: null as number | null, key: Phase.Ended },
  ];
  const activeIdx = phase === Phase.Proposing ? 0 : phase === Phase.Voting ? 1 : 2;
  const fmtT = (t: number) =>
    new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  return (
    <div className="grid-table grid-cols-3">
      {steps.map((s, i) => {
        const active = i === activeIdx;
        const done = i < activeIdx || phase === Phase.Finalized;
        return (
          <div key={s.label} style={{ background: active ? "var(--white)" : undefined }}>
            <p className="meta" style={{ color: active ? "var(--red)" : done ? "var(--ink)" : "var(--gray)" }}>
              {active ? "● " : ""}{s.label}
            </p>
            <p className="serif mt-2" style={{ fontSize: 18 }}>
              {s.to === null ? `after ${fmtT(s.from)}` : `${fmtT(s.from)} – ${fmtT(s.to)}`}
            </p>
            {active && s.to !== null && (
              <p className="mt-1 text-xs" style={{ color: "var(--gray)" }}>{countdown(s.to, now)} left</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProposalRow({
  p, rank, phase, maxVotes, votesLeft, canVote, busy, onVote, isYou,
}: {
  p: Proposal; rank: number; phase: Phase; maxVotes: bigint; votesLeft: bigint; canVote: boolean; busy: boolean;
  onVote: (weight: bigint) => Promise<boolean>; isYou: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("1");
  const showVotes = phase !== Phase.Proposing;
  const pct = maxVotes > 0n ? Number((p.votes * 100n) / maxVotes) : 0;

  return (
    <article className="py-8 grid md:grid-cols-12 gap-6 fade">
      <div className="md:col-span-2 flex md:flex-col gap-3 md:gap-1">
        <span className="meta" style={{ color: "var(--ink)" }}>{showVotes ? `#${rank}` : `No. ${Number(p.id) + 1}`}</span>
        {p.won && <span className="meta" style={{ color: "var(--red)" }}>Winner</span>}
        {isYou && <span className="meta">Yours</span>}
      </div>

      <div className="md:col-span-7">
        <h3 className="serif t-item">{p.title}</h3>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>{p.tldr}</p>
        {p.body && (
          <>
            <button className="meta link-u mt-4" style={{ color: "var(--ink)" }} onClick={() => setOpen((v) => !v)}>
              {open ? "Hide full text" : "Read full text"}
            </button>
            {open && (
              <div className="mt-4 text-[15px] leading-relaxed whitespace-pre-line" style={{ color: "var(--text)" }}>
                {p.body}
              </div>
            )}
          </>
        )}
        <p className="meta mt-4">
          {shortAddr(p.proposer)} · {fmtDate(p.createdAt)}
        </p>
      </div>

      <div className="md:col-span-3 md:text-right">
        {showVotes && (
          <>
            <p className="serif" style={{ fontSize: 28, lineHeight: 1 }}>{p.votes.toString()}</p>
            <p className="meta mt-1">votes</p>
            <div className="mt-3 h-px w-full" style={{ background: "var(--hair)" }}>
              <div className="h-px" style={{ width: `${pct}%`, background: p.won ? "var(--red)" : "var(--ink)", marginLeft: "auto" }} />
            </div>
          </>
        )}
        {canVote && (
          <form
            className="mt-4 flex md:justify-end items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const w = BigInt(Math.max(1, Math.floor(Number(weight) || 1)));
              if (w > votesLeft) {
                toast.error(`You only have ${votesLeft.toString()} vote(s) left.`);
                return;
              }
              if (await onVote(w)) setWeight("1");
            }}
          >
            <input className="field" style={{ width: 72, height: 36, padding: "0 14px", fontSize: 13 }} type="number" min={1} max={Number(votesLeft)} value={weight} onChange={(e) => setWeight(e.target.value)} />
            <button className="btn btn-red btn-sm" type="submit" disabled={busy}>
              {busy ? "…" : "Vote"}
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function ProposalForm({
  enabled, reason, busy, onSubmit,
}: {
  enabled: boolean; reason?: string; busy: boolean; onSubmit: (title: string, tldr: string, body: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [tldr, setTldr] = useState("");
  const [body, setBody] = useState("");
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !tldr.trim()) {
          toast.error("Title and summary are required.");
          return;
        }
        if (await onSubmit(title.trim(), tldr.trim(), body.trim())) {
          setTitle(""); setTldr(""); setBody("");
        }
      }}
    >
      {reason && <p className="meta" style={{ color: "var(--red)" }}>{reason}</p>}
      <Field label="Title" hint={`${bytes(title)} / 120`}>
        <input className="field" maxLength={120} disabled={!enabled} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short, formal title" />
      </Field>
      <Field label="Summary" hint={`${bytes(tldr)} / 280`}>
        <textarea className="field" rows={3} maxLength={280} disabled={!enabled} value={tldr} onChange={(e) => setTldr(e.target.value)} placeholder="One paragraph. What are you asking the House to fund, and why?" />
      </Field>
      <Field label="Full text" hint={`${bytes(body)} / 6000 · optional`}>
        <textarea className="field" rows={9} maxLength={6000} disabled={!enabled} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details, budget, timeline, deliverables." />
      </Field>
      <div className="flex justify-end">
        <button className="btn btn-red" type="submit" disabled={!enabled || busy}>
          {busy ? "Submitting…" : "Submit to the House"}
        </button>
      </div>
    </form>
  );
}

function FundForm({ busy, onFund }: { busy: boolean; onFund: (eth: string) => Promise<boolean> }) {
  const [amount, setAmount] = useState("0.01");
  return (
    <form
      className="mt-8 flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;
        onFund(amount);
      }}
    >
      <input className="field" style={{ width: 140 }} type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <span className="meta">ETH</span>
      <button className="btn btn-outline" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Add to today's treasury"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        {hint && <span className="field-label">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
