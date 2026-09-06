"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { readContract, writeContract } from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther, type Address } from "viem";
import { toast } from "sonner";

import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import Seal from "@/app/components/Seal";
import { DEWHITEHOUSE_ABI, RoundState } from "@/app/abi/dewhitehouse";
import { NFT_ABI } from "@/app/abi/nft";
import { CONTRACT_ADDR, COLLECTION_ADDR, IS_DEPLOYED } from "@/app/lib/config";
import { awaitTx } from "@/app/lib/awaitTx";
import { describeRevert, isUserRejected } from "@/app/lib/errors";
import { countdown, eth, fmtDate, isSameAddr, shortAddr } from "@/app/lib/format";

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------
type Round = {
  id: number;
  title: string;
  description: string;
  proposingStart: number;
  proposingEnd: number;
  votingEnd: number;
  numWinners: number;
  budget: bigint;
  proposalCount: number;
  finalized: boolean;
  cancelled: boolean;
  state: RoundState;
};

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

const STATE_LABEL: Record<RoundState, string> = {
  [RoundState.NotStarted]: "Opens soon",
  [RoundState.Proposing]: "Accepting proposals",
  [RoundState.Voting]: "Voting open",
  [RoundState.Ended]: "Awaiting results",
  [RoundState.Finalized]: "Concluded",
  [RoundState.Cancelled]: "Cancelled",
};

const nowSec = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------
export default function HomePage() {
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [now, setNow] = useState(nowSec());
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [admin, setAdmin] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);

  const [votingPower, setVotingPower] = useState<bigint>(0n);
  const [votesLeft, setVotesLeft] = useState<bigint>(0n);
  const [hasProposed, setHasProposed] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);

  // Saniyelik saat — geri sayim ve faz hesabi icin
  useEffect(() => {
    const t = setInterval(() => setNow(nowSec()), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = useMemo(
    () => rounds.find((r) => r.id === selectedId) ?? null,
    [rounds, selectedId],
  );

  // Faz, zincirdeki roundState yerine yerel saatle de hesaplanabilir; ikisini birlestiriyoruz
  const phase: RoundState | null = useMemo(() => {
    if (!selected) return null;
    if (selected.cancelled) return RoundState.Cancelled;
    if (selected.finalized) return RoundState.Finalized;
    if (now < selected.proposingStart) return RoundState.NotStarted;
    if (now < selected.proposingEnd) return RoundState.Proposing;
    if (now < selected.votingEnd) return RoundState.Voting;
    return RoundState.Ended;
  }, [selected, now]);

  const isAdmin = isSameAddr(address, admin ?? undefined);

  // -------------------------------------------------------------------------
  // Zincirden okuma
  // -------------------------------------------------------------------------
  const loadRounds = useCallback(async () => {
    if (!IS_DEPLOYED) {
      setLoading(false);
      return;
    }
    try {
      const [count, adm] = await Promise.all([
        readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "roundCount", chainId: base.id }),
        readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "administration", chainId: base.id }),
      ]);
      setAdmin(adm as Address);
      const n = Number(count);
      const list: Round[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const [r, s] = await Promise.all([
          readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "getRound", args: [BigInt(i)], chainId: base.id }),
          readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "roundState", args: [BigInt(i)], chainId: base.id }),
        ]);
        list.push({
          id: i,
          title: r.title,
          description: r.description,
          proposingStart: Number(r.proposingStart),
          proposingEnd: Number(r.proposingEnd),
          votingEnd: Number(r.votingEnd),
          numWinners: Number(r.numWinners),
          budget: r.budget,
          proposalCount: Number(r.proposalCount),
          finalized: r.finalized,
          cancelled: r.cancelled,
          state: Number(s) as RoundState,
        });
      }
      setRounds(list);
      setSelectedId((cur) => {
        if (cur !== null && list.some((r) => r.id === cur)) return cur;
        const live = list.find((r) => !r.cancelled && !r.finalized);
        return (live ?? list[0])?.id ?? null;
      });
    } catch (e) {
      console.error("loadRounds", e);
      toast.error("Couldn't read the House from Base. Retrying shortly.");
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadProposals = useCallback(async () => {
    if (!IS_DEPLOYED || selectedId === null) return;
    try {
      const list = await readContract(config, {
        address: CONTRACT_ADDR,
        abi: DEWHITEHOUSE_ABI,
        functionName: "getRoundProposals",
        args: [BigInt(selectedId)],
        chainId: base.id,
      });
      setProposals([...list] as Proposal[]);
    } catch (e) {
      console.error("loadProposals", e);
    }
  }, [config, selectedId]);

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
      if (IS_DEPLOYED && selectedId !== null) {
        const [left, proposed] = await Promise.all([
          readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "votesRemaining", args: [BigInt(selectedId), address], chainId: base.id }),
          readContract(config, { address: CONTRACT_ADDR, abi: DEWHITEHOUSE_ABI, functionName: "hasProposed", args: [BigInt(selectedId), address], chainId: base.id }),
        ]);
        setVotesLeft(left);
        setHasProposed(proposed);
      }
    } catch (e) {
      console.error("loadUser", e);
    }
  }, [config, address, selectedId]);

  useEffect(() => {
    loadRounds();
    const t = setInterval(loadRounds, 30_000);
    return () => clearInterval(t);
  }, [loadRounds]);

  useEffect(() => {
    loadProposals();
    const t = setInterval(loadProposals, 20_000);
    return () => clearInterval(t);
  }, [loadProposals]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRounds(), loadProposals(), loadUser()]);
  }, [loadRounds, loadProposals, loadUser]);

  // -------------------------------------------------------------------------
  // Yazma yardimcisi
  // -------------------------------------------------------------------------
  const ensureChain = async () => {
    if (chainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }
  };

  const runTx = async (key: string, fn: () => Promise<`0x${string}`>, successMsg: string) => {
    if (!isConnected) {
      toast.error("Connect a wallet first.");
      return false;
    }
    setBusy(key);
    try {
      await ensureChain();
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

  // -------------------------------------------------------------------------
  // Eylemler
  // -------------------------------------------------------------------------
  const submitProposal = async (title: string, tldr: string, body: string) => {
    if (selectedId === null) return false;
    return runTx(
      "propose",
      () =>
        writeContract(config, {
          address: CONTRACT_ADDR,
          abi: DEWHITEHOUSE_ABI,
          functionName: "propose",
          args: [BigInt(selectedId), title, tldr, body],
          chainId: base.id,
        }),
      "Your proposal is on the record.",
    );
  };

  const castVote = async (proposalId: bigint, weight: bigint) =>
    runTx(
      `vote-${proposalId}`,
      () =>
        writeContract(config, {
          address: CONTRACT_ADDR,
          abi: DEWHITEHOUSE_ABI,
          functionName: "vote",
          args: [proposalId, weight],
          chainId: base.id,
        }),
      "Vote recorded on Base.",
    );

  const finalizeRound = async () => {
    if (selectedId === null) return;
    await runTx(
      "finalize",
      () =>
        writeContract(config, {
          address: CONTRACT_ADDR,
          abi: DEWHITEHOUSE_ABI,
          functionName: "finalize",
          args: [BigInt(selectedId)],
          chainId: base.id,
        }),
      "Round concluded. Winners have been paid.",
    );
  };

  const fundRound = async (amountEth: string) => {
    if (selectedId === null) return;
    await runTx(
      "fund",
      () =>
        writeContract(config, {
          address: CONTRACT_ADDR,
          abi: DEWHITEHOUSE_ABI,
          functionName: "fundRound",
          args: [BigInt(selectedId)],
          value: parseEther(amountEth),
          chainId: base.id,
        }),
      "Treasury topped up.",
    );
  };

  const createRound = async (f: {
    title: string;
    description: string;
    proposingDays: number;
    votingDays: number;
    numWinners: number;
    budgetEth: string;
  }) =>
    runTx(
      "create",
      () =>
        writeContract(config, {
          address: CONTRACT_ADDR,
          abi: DEWHITEHOUSE_ABI,
          functionName: "createRound",
          args: [
            f.title,
            f.description,
            0n,
            BigInt(Math.round(f.proposingDays * 86400)),
            BigInt(Math.round(f.votingDays * 86400)),
            f.numWinners,
          ],
          value: f.budgetEth ? parseEther(f.budgetEth) : 0n,
          chainId: base.id,
        }),
      "New round opened.",
    );

  // -------------------------------------------------------------------------
  // Turetilmis veriler
  // -------------------------------------------------------------------------
  const sortedProposals = useMemo(() => {
    const list = [...proposals];
    if (phase === RoundState.Proposing) return list.sort((a, b) => Number(a.id - b.id));
    return list.sort((a, b) => (b.votes === a.votes ? Number(a.id - b.id) : b.votes > a.votes ? 1 : -1));
  }, [proposals, phase]);

  const maxVotes = useMemo(
    () => proposals.reduce((m, p) => (p.votes > m ? p.votes : m), 0n),
    [proposals],
  );

  const phaseLabel = phase !== null ? STATE_LABEL[phase] : IS_DEPLOYED ? undefined : "Not deployed";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div id="top">
      <Header phaseLabel={phaseLabel} />

      {/* HERO */}
      <section style={{ background: "var(--deep-navy)", color: "#fff" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-24 grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-8 wh-fade">
            <p className="wh-eyebrow" style={{ color: "var(--amber)" }}>
              Office of Proposals
            </p>
            <h1 className="wh-display mt-5" style={{ fontSize: "clamp(40px, 7vw, 84px)" }}>
              The People&apos;s
              <br />
              House
            </h1>
            <p className="mt-8 text-lg leading-relaxed max-w-2xl" style={{ color: "var(--pale-gray)" }}>
              Any VRNouns holder may bring a proposal before the House. Holders vote. The treasury pays the
              winners. There is no committee, no clerk and no server in between: the whole process is a
              contract on Base.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#submit" className="wh-btn wh-btn--light">
                Submit a proposal
              </a>
              <a href="#proposals" className="wh-btn" style={{ borderColor: "rgba(255,255,255,0.35)", background: "transparent" }}>
                Read the docket
              </a>
            </div>
          </div>
          <div className="lg:col-span-4 hidden lg:flex justify-end wh-fade">
            <Seal size={220} color="rgba(255,255,255,0.18)" />
          </div>
        </div>
      </section>

      {/* DEPLOY UYARISI */}
      {!IS_DEPLOYED && (
        <div style={{ background: "var(--amber)", color: "var(--deep-navy)" }}>
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="wh-label">Notice</span>
            <span>
              The House contract has not been deployed yet. Deploy <code>contracts/DeWhiteHouse.sol</code> to
              Base and set <code>NEXT_PUBLIC_CONTRACT_ADDR</code>.
            </span>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* BRIEFING ROOM — mevcut tur */}
        <section id="briefing" className="pt-20">
          <SectionHead eyebrow="Briefing Room" title="Current round" />

          {loading ? (
            <p className="mt-8 text-sm" style={{ color: "var(--gray)" }}>
              Reading the House from Base…
            </p>
          ) : !selected ? (
            <EmptyState text="No round has been opened yet. The Administration will announce the first one here." />
          ) : (
            <div className="mt-8 grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8">
                <div className="wh-card p-8 sm:p-10">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="wh-label" style={{ color: "var(--red)" }}>
                      Round No. {selected.id + 1}
                    </span>
                    {rounds.length > 1 && (
                      <select
                        className="wh-input"
                        style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                        value={selected.id}
                        onChange={(e) => setSelectedId(Number(e.target.value))}
                      >
                        {rounds.map((r) => (
                          <option key={r.id} value={r.id}>
                            No. {r.id + 1} — {r.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <h3 className="wh-h1 mt-4" style={{ fontSize: "clamp(30px, 4vw, 46px)" }}>
                    {selected.title}
                  </h3>
                  {selected.description && (
                    <p className="mt-5 leading-relaxed whitespace-pre-line" style={{ color: "var(--charcoal)" }}>
                      {selected.description}
                    </p>
                  )}

                  <Timeline round={selected} phase={phase!} now={now} />
                </div>
              </div>

              <aside className="lg:col-span-4 flex flex-col gap-4">
                <Stat label="Treasury" value={eth(selected.budget)} sub={selected.finalized ? "Distributed" : "Held in contract"} />
                <Stat label="Winners" value={`${selected.numWinners}`} sub={selected.budget > 0n ? `${eth(selected.budget / BigInt(selected.numWinners))} each, at most` : "Recognition only"} />
                <Stat label="Proposals" value={`${selected.proposalCount}`} sub="Submitted to this round" />
                <Stat
                  label="Your votes"
                  value={isConnected ? `${votesLeft.toString()} / ${votingPower.toString()}` : "—"}
                  sub={isConnected ? (votingPower > 0n ? "1 VRNouns = 1 vote" : "No VRNouns in this wallet") : "Connect to see your standing"}
                />
              </aside>
            </div>
          )}
        </section>

        {/* PROPOSALS */}
        <section id="proposals" className="pt-24">
          <SectionHead
            eyebrow="The Docket"
            title="Proposals before the House"
            aside={
              phase === RoundState.Voting && isConnected
                ? `${votesLeft.toString()} vote${votesLeft === 1n ? "" : "s"} remaining`
                : undefined
            }
          />

          {selected && sortedProposals.length === 0 && (
            <EmptyState
              text={
                phase === RoundState.Proposing
                  ? "The docket is empty. Be the first to bring a proposal before the House."
                  : "No proposals were submitted to this round."
              }
            />
          )}

          <div className="mt-8 flex flex-col gap-5">
            {sortedProposals.map((p, idx) => (
              <ProposalCard
                key={p.id.toString()}
                p={p}
                rank={idx + 1}
                phase={phase!}
                maxVotes={maxVotes}
                votesLeft={votesLeft}
                canVote={phase === RoundState.Voting && isConnected && votesLeft > 0n}
                busy={busy === `vote-${p.id}`}
                onVote={(w) => castVote(p.id, w)}
                isYou={isSameAddr(address, p.proposer)}
              />
            ))}
          </div>

          {selected && phase === RoundState.Ended && (
            <div className="wh-card mt-8 p-8 flex flex-wrap items-center justify-between gap-6" style={{ background: "var(--light-gray)" }}>
              <div>
                <p className="wh-label" style={{ color: "var(--red)" }}>Voting has closed</p>
                <p className="mt-2 text-sm" style={{ color: "var(--charcoal)" }}>
                  Anyone may conclude the round. The contract ranks the proposals, pays the winners and seals the record.
                </p>
              </div>
              <button className="wh-btn" disabled={busy !== null} onClick={finalizeRound}>
                {busy === "finalize" ? "Concluding…" : "Conclude round"}
              </button>
            </div>
          )}
        </section>

        {/* SUBMIT */}
        <section id="submit" className="pt-24">
          <SectionHead eyebrow="Petition the House" title="Submit a proposal" />
          <div className="mt-8 grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7">
              <ProposalForm
                enabled={IS_DEPLOYED && phase === RoundState.Proposing && isConnected && votingPower > 0n && !hasProposed}
                reason={
                  !IS_DEPLOYED
                    ? "The House contract is not deployed yet."
                    : !selected
                      ? "No round is open."
                      : phase !== RoundState.Proposing
                        ? "Proposals are only accepted during the proposing period."
                        : !isConnected
                          ? "Connect a wallet holding VRNouns to submit."
                          : votingPower === 0n
                            ? "This wallet holds no VRNouns."
                            : hasProposed
                              ? "This wallet has already submitted a proposal for this round."
                              : undefined
                }
                busy={busy === "propose"}
                onSubmit={submitProposal}
              />
            </div>
            <div className="lg:col-span-5">
              <div className="wh-card p-8" style={{ background: "var(--light-gray)" }}>
                <p className="wh-label">How it works</p>
                <ol className="mt-5 flex flex-col gap-4 text-sm leading-relaxed" style={{ color: "var(--charcoal)" }}>
                  <li><strong>1. Propose.</strong> During the proposing period any VRNouns holder submits one proposal. The full text is stored on Base.</li>
                  <li><strong>2. Vote.</strong> During the voting period holders split their votes across proposals. One VRNouns equals one vote.</li>
                  <li><strong>3. Conclude.</strong> When voting ends, anyone calls the contract. It ranks proposals, pays the top ones from the treasury and marks them as winners.</li>
                </ol>
                <p className="mt-6 text-xs" style={{ color: "var(--gray)" }}>
                  No backend. No moderation queue. What you sign is what is published.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ADMINISTRATION */}
        <section id="administration" className="pt-24">
          <SectionHead eyebrow="The Administration" title="Treasury and rounds" />
          <div className="mt-8 grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
              <div className="wh-card p-8">
                <p className="wh-label">Administration</p>
                <p className="mt-3 text-sm break-all" style={{ color: "var(--charcoal)" }}>
                  {admin ? admin : IS_DEPLOYED ? "…" : "Set on deployment"}
                </p>
                <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--charcoal)" }}>
                  The Administration opens rounds and seeds the treasury. It cannot edit proposals, cannot
                  change votes and cannot pick winners. Anyone may add to a round&apos;s treasury.
                </p>
                {selected && !selected.finalized && !selected.cancelled && IS_DEPLOYED && (
                  <FundForm busy={busy === "fund"} onFund={fundRound} />
                )}
              </div>
            </div>
            <div className="lg:col-span-7">
              {isAdmin ? (
                <CreateRoundForm busy={busy === "create"} onCreate={createRound} />
              ) : (
                <div className="wh-card p-8" style={{ background: "var(--light-gray)" }}>
                  <p className="wh-label">Open a round</p>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--charcoal)" }}>
                    Only the Administration wallet can open a new round. Connect with that wallet to see the form.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ARCHIVE */}
        <section id="archive" className="pt-24">
          <SectionHead eyebrow="Records" title="Archive of rounds" />
          {rounds.length === 0 ? (
            <EmptyState text="No rounds on record." />
          ) : (
            <div className="mt-8 wh-card divide-y" style={{ borderColor: "var(--pale-gray)" }}>
              {rounds.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    document.getElementById("briefing")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="w-full text-left px-6 py-5 flex flex-wrap items-center gap-x-8 gap-y-2 hover:bg-[var(--light-gray)] transition-colors"
                  style={{ borderColor: "var(--pale-gray)" }}
                >
                  <span className="wh-label w-20" style={{ color: "var(--red)" }}>No. {r.id + 1}</span>
                  <span className="wh-h3 flex-1 min-w-[200px]" style={{ fontSize: 22 }}>{r.title}</span>
                  <span className="text-sm" style={{ color: "var(--gray)" }}>{fmtDate(r.proposingStart)}</span>
                  <span className="wh-eyebrow" style={{ color: r.state === RoundState.Finalized ? "var(--deep-navy)" : "var(--gray)" }}>
                    {STATE_LABEL[r.state]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parcalar
// ---------------------------------------------------------------------------
function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5" style={{ borderBottom: "2px solid var(--deep-navy)" }}>
      <div>
        <p className="wh-eyebrow" style={{ color: "var(--red)" }}>{eyebrow}</p>
        <h2 className="wh-h2 mt-2" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>{title}</h2>
      </div>
      {aside && <span className="wh-label" style={{ color: "var(--charcoal)" }}>{aside}</span>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-8 p-10 text-center wh-card" style={{ background: "var(--light-gray)" }}>
      <p className="text-sm" style={{ color: "var(--charcoal)" }}>{text}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="wh-card p-6">
      <p className="wh-eyebrow" style={{ color: "var(--gray)" }}>{label}</p>
      <p className="wh-h2 mt-2" style={{ fontSize: 30 }}>{value}</p>
      {sub && <p className="mt-1 text-xs" style={{ color: "var(--gray)" }}>{sub}</p>}
    </div>
  );
}

function Timeline({ round, phase, now }: { round: Round; phase: RoundState; now: number }) {
  const steps = [
    { key: RoundState.Proposing, label: "Proposing", from: round.proposingStart, to: round.proposingEnd },
    { key: RoundState.Voting, label: "Voting", from: round.proposingEnd, to: round.votingEnd },
    { key: RoundState.Finalized, label: "Results", from: round.votingEnd, to: null as number | null },
  ];
  const activeIdx =
    phase === RoundState.NotStarted || phase === RoundState.Proposing ? 0 : phase === RoundState.Voting ? 1 : 2;

  return (
    <div className="mt-10">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((s, i) => {
          const active = i === activeIdx && phase !== RoundState.Cancelled;
          const done = i < activeIdx || phase === RoundState.Finalized;
          return (
            <div key={s.label}>
              <div className="h-1" style={{ background: active ? "var(--red)" : done ? "var(--deep-navy)" : "var(--pale-gray)" }} />
              <p className="wh-label mt-3" style={{ color: active ? "var(--red)" : done ? "var(--deep-navy)" : "var(--gray)" }}>
                {s.label}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--gray)" }}>
                {s.to === null ? `From ${fmtDate(s.from)}` : `${fmtDate(s.from)} → ${fmtDate(s.to)}`}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="wh-label">{STATE_LABEL[phase]}</span>
        {phase === RoundState.NotStarted && <span className="text-sm" style={{ color: "var(--charcoal)" }}>Proposing opens in {countdown(round.proposingStart, now)}</span>}
        {phase === RoundState.Proposing && <span className="text-sm" style={{ color: "var(--charcoal)" }}>Proposals close in {countdown(round.proposingEnd, now)}</span>}
        {phase === RoundState.Voting && <span className="text-sm" style={{ color: "var(--charcoal)" }}>Voting closes in {countdown(round.votingEnd, now)}</span>}
      </div>
    </div>
  );
}

function ProposalCard({
  p,
  rank,
  phase,
  maxVotes,
  votesLeft,
  canVote,
  busy,
  onVote,
  isYou,
}: {
  p: Proposal;
  rank: number;
  phase: RoundState;
  maxVotes: bigint;
  votesLeft: bigint;
  canVote: boolean;
  busy: boolean;
  onVote: (weight: bigint) => Promise<boolean>;
  isYou: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("1");
  const pct = maxVotes > 0n ? Number((p.votes * 100n) / maxVotes) : 0;
  const showVotes = phase !== RoundState.Proposing && phase !== RoundState.NotStarted;

  return (
    <article className="wh-card p-7 sm:p-8 wh-fade" style={p.won ? { borderColor: "var(--deep-navy)", borderWidth: 2 } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="wh-label" style={{ color: "var(--red)" }}>
            {showVotes ? `#${rank}` : `No. ${Number(p.id) + 1}`}
          </span>
          {p.won && (
            <span className="wh-eyebrow px-2.5 py-1" style={{ background: "var(--deep-navy)", color: "var(--amber)" }}>
              Winner
            </span>
          )}
          {isYou && (
            <span className="wh-eyebrow px-2.5 py-1" style={{ border: "1px solid var(--pale-gray)", color: "var(--gray)" }}>
              Yours
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--gray)" }}>
          by {shortAddr(p.proposer)} · {fmtDate(p.createdAt)}
        </span>
      </div>

      <h3 className="wh-h2 mt-4" style={{ fontSize: "clamp(24px, 3vw, 32px)" }}>{p.title}</h3>
      <p className="mt-3 leading-relaxed" style={{ color: "var(--charcoal)" }}>{p.tldr}</p>

      {p.body && (
        <>
          <button className="wh-eyebrow mt-4 underline underline-offset-4" style={{ color: "var(--deep-navy)" }} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide full text" : "Read full text"}
          </button>
          {open && (
            <div className="mt-4 pt-4 text-[15px] leading-relaxed whitespace-pre-line" style={{ borderTop: "1px solid var(--pale-gray)", color: "var(--charcoal)" }}>
              {p.body}
            </div>
          )}
        </>
      )}

      {showVotes && (
        <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--pale-gray)" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-baseline gap-2">
                <span className="wh-h3" style={{ fontSize: 26 }}>{p.votes.toString()}</span>
                <span className="wh-eyebrow" style={{ color: "var(--gray)" }}>votes</span>
              </div>
              <div className="mt-2 h-1.5 w-full" style={{ background: "var(--light-gray)" }}>
                <div className="h-full" style={{ width: `${pct}%`, background: p.won ? "var(--amber)" : "var(--deep-navy)", transition: "width 0.4s" }} />
              </div>
            </div>
            {canVote && (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const w = BigInt(Math.max(1, Math.floor(Number(weight) || 1)));
                  if (w > votesLeft) {
                    toast.error(`You only have ${votesLeft.toString()} vote(s) left.`);
                    return;
                  }
                  const ok = await onVote(w);
                  if (ok) setWeight("1");
                }}
              >
                <input
                  className="wh-input"
                  style={{ width: 80, padding: "10px 12px" }}
                  type="number"
                  min={1}
                  max={Number(votesLeft)}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
                <button className="wh-btn" type="submit" disabled={busy}>
                  {busy ? "Voting…" : "Vote"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ProposalForm({
  enabled,
  reason,
  busy,
  onSubmit,
}: {
  enabled: boolean;
  reason?: string;
  busy: boolean;
  onSubmit: (title: string, tldr: string, body: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [tldr, setTldr] = useState("");
  const [body, setBody] = useState("");
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  return (
    <form
      className="wh-card p-8 sm:p-10 flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !tldr.trim()) {
          toast.error("Title and summary are required.");
          return;
        }
        const ok = await onSubmit(title.trim(), tldr.trim(), body.trim());
        if (ok) {
          setTitle("");
          setTldr("");
          setBody("");
        }
      }}
    >
      {reason && (
        <div className="text-sm px-4 py-3" style={{ background: "var(--light-gray)", color: "var(--charcoal)" }}>
          {reason}
        </div>
      )}
      <Field label="Title" hint={`${bytes(title)}/120`}>
        <input className="wh-input" maxLength={120} disabled={!enabled} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short, formal title" />
      </Field>
      <Field label="Summary" hint={`${bytes(tldr)}/280`}>
        <textarea className="wh-input" rows={3} maxLength={280} disabled={!enabled} value={tldr} onChange={(e) => setTldr(e.target.value)} placeholder="One paragraph. What are you asking the House to fund, and why?" />
      </Field>
      <Field label="Full text" hint={`${bytes(body)}/6000 · optional`}>
        <textarea className="wh-input" rows={10} maxLength={6000} disabled={!enabled} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details, budget, timeline, deliverables. Stored on-chain in full." />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs" style={{ color: "var(--gray)" }}>
          One proposal per wallet per round. Longer text costs more gas.
        </p>
        <button className="wh-btn" type="submit" disabled={!enabled || busy}>
          {busy ? "Submitting…" : "Submit to the House"}
        </button>
      </div>
    </form>
  );
}

function FundForm({ busy, onFund }: { busy: boolean; onFund: (eth: string) => Promise<void> }) {
  const [amount, setAmount] = useState("0.01");
  return (
    <form
      className="mt-6 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) return;
        onFund(amount);
      }}
    >
      <input className="wh-input" style={{ width: 120, padding: "10px 12px" }} type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <span className="text-sm" style={{ color: "var(--gray)" }}>ETH</span>
      <button className="wh-btn wh-btn--ghost" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Add to treasury"}
      </button>
    </form>
  );
}

function CreateRoundForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (f: { title: string; description: string; proposingDays: number; votingDays: number; numWinners: number; budgetEth: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [proposingDays, setProposingDays] = useState("5");
  const [votingDays, setVotingDays] = useState("3");
  const [numWinners, setNumWinners] = useState("3");
  const [budgetEth, setBudgetEth] = useState("0.1");

  return (
    <form
      className="wh-card p-8 sm:p-10 flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) {
          toast.error("Round title is required.");
          return;
        }
        const ok = await onCreate({
          title: title.trim(),
          description: description.trim(),
          proposingDays: Number(proposingDays),
          votingDays: Number(votingDays),
          numWinners: Math.max(1, Math.floor(Number(numWinners) || 1)),
          budgetEth,
        });
        if (ok) {
          setTitle("");
          setDescription("");
        }
      }}
    >
      <p className="wh-label" style={{ color: "var(--red)" }}>Open a new round</p>
      <Field label="Round title">
        <input className="wh-input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spring 2026 — Community Builders" />
      </Field>
      <Field label="Description">
        <textarea className="wh-input" rows={4} maxLength={6000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this round for? Who should apply?" />
      </Field>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Proposing (days)"><input className="wh-input" type="number" step="0.5" min="0.01" value={proposingDays} onChange={(e) => setProposingDays(e.target.value)} /></Field>
        <Field label="Voting (days)"><input className="wh-input" type="number" step="0.5" min="0.01" value={votingDays} onChange={(e) => setVotingDays(e.target.value)} /></Field>
        <Field label="Winners"><input className="wh-input" type="number" min="1" max="64" value={numWinners} onChange={(e) => setNumWinners(e.target.value)} /></Field>
        <Field label="Treasury (ETH)"><input className="wh-input" type="number" step="0.001" min="0" value={budgetEth} onChange={(e) => setBudgetEth(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end">
        <button className="wh-btn wh-btn--red" type="submit" disabled={busy}>
          {busy ? "Opening…" : "Open round"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between">
        <span className="wh-label" style={{ color: "var(--charcoal)" }}>{label}</span>
        {hint && <span className="text-xs" style={{ color: "var(--gray)" }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

