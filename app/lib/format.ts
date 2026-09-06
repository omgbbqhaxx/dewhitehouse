import { formatEther, type Address } from "viem";

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const eth = (wei: bigint, digits = 4) => {
  const n = Number(formatEther(wei));
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
};

export const fmtDate = (ts: number | bigint) =>
  new Date(Number(ts) * 1000).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const countdown = (untilTs: number, now: number) => {
  const s = Math.max(0, untilTs - now);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
};

export const isSameAddr = (a?: Address | string, b?: Address | string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
