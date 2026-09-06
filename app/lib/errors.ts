export const isUserRejected = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return (
    code === 4001 ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("action_rejected")
  );
};

// Kontrat revert mesajlarini insan diline cevirir.
export const describeRevert = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.toLowerCase();
  const table: [string, string][] = [
    ["must hold collection nft", "You need a VRNouns NFT in this wallet to take part."],
    ["not proposing period", "The proposing period is not open right now."],
    ["not voting period", "The voting period is not open right now."],
    ["one proposal per wallet", "This wallet has already submitted a proposal for this round."],
    ["round full", "This round has reached its proposal limit."],
    ["exceeds voting power", "That exceeds the votes you have left in this round."],
    ["round not ended", "The voting period has not ended yet."],
    ["round closed", "This round is already finalized or cancelled."],
    ["not administration", "Only the Administration can do that."],
    ["bad title", "Title must be 1–120 characters."],
    ["bad tldr", "Summary must be 1–280 characters."],
    ["body too long", "Body is too long."],
    ["insufficient funds", "Insufficient ETH for gas on Base."],
  ];
  for (const [needle, text] of table) if (msg.includes(needle)) return text;
  const m = raw.match(/reason:\s*([^\n]+)/i);
  return m ? m[1].trim() : "Transaction failed.";
};
