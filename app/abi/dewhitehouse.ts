import { parseAbi } from "viem";

// contracts/DeWhiteHouse.sol ile birebir uyumlu, insan okunur ABI.
export const DEWHITEHOUSE_ABI = parseAbi([
  "struct Round { string title; string description; uint64 proposingStart; uint64 proposingEnd; uint64 votingEnd; uint16 numWinners; uint256 budget; uint256 proposalCount; bool finalized; bool cancelled; }",
  "struct Proposal { uint256 id; uint256 roundId; address proposer; string title; string tldr; string body; uint256 votes; uint64 createdAt; bool won; }",
  "function administration() view returns (address)",
  "function collection() view returns (address)",
  "function roundCount() view returns (uint256)",
  "function proposalCount() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (Round)",
  "function getProposal(uint256 proposalId) view returns (Proposal)",
  "function getRoundProposals(uint256 roundId) view returns (Proposal[])",
  "function getRoundWinners(uint256 roundId) view returns (uint256[])",
  "function roundState(uint256 roundId) view returns (uint8)",
  "function votingPower(address account) view returns (uint256)",
  "function votesRemaining(uint256 roundId, address account) view returns (uint256)",
  "function votesUsed(uint256 roundId, address account) view returns (uint256)",
  "function hasProposed(uint256 roundId, address account) view returns (bool)",
  "function createRound(string title, string description, uint64 proposingStart, uint64 proposingDuration, uint64 votingDuration, uint16 numWinners) payable returns (uint256)",
  "function fundRound(uint256 roundId) payable",
  "function cancelRound(uint256 roundId)",
  "function propose(uint256 roundId, string title, string tldr, string body) returns (uint256)",
  "function vote(uint256 proposalId, uint256 weight)",
  "function voteBatch(uint256[] proposalIds, uint256[] weights)",
  "function finalize(uint256 roundId)",
]);

export enum RoundState {
  NotStarted = 0,
  Proposing = 1,
  Voting = 2,
  Ended = 3,
  Finalized = 4,
  Cancelled = 5,
}
