import { parseAbi } from "viem";

// contracts/DeWhiteHouse.sol ile birebir uyumlu, insan okunur ABI.
export const DEWHITEHOUSE_ABI = parseAbi([
  "struct Proposal { uint256 id; uint256 roundId; address proposer; string title; string tldr; string body; uint256 votes; uint64 createdAt; bool won; }",
  "function ROUND_LENGTH() view returns (uint256)",
  "function PROPOSING_LENGTH() view returns (uint256)",
  "function NUM_WINNERS() view returns (uint256)",
  "function collection() view returns (address)",
  "function currentRoundId() view returns (uint256)",
  "function roundStart(uint256 roundId) pure returns (uint256)",
  "function proposingEnd(uint256 roundId) pure returns (uint256)",
  "function votingEnd(uint256 roundId) pure returns (uint256)",
  "function phaseOf(uint256 roundId) view returns (uint8)",
  "function budget(uint256 roundId) view returns (uint256)",
  "function finalized(uint256 roundId) view returns (bool)",
  "function proposalCount() view returns (uint256)",
  "function roundProposalCount(uint256 roundId) view returns (uint256)",
  "function getProposal(uint256 proposalId) view returns (Proposal)",
  "function getRoundProposals(uint256 roundId) view returns (Proposal[])",
  "function getRoundWinners(uint256 roundId) view returns (uint256[])",
  "function touchedRounds() view returns (uint256[])",
  "function votingPower(address account) view returns (uint256)",
  "function votesRemaining(uint256 roundId, address account) view returns (uint256)",
  "function votesUsed(uint256 roundId, address account) view returns (uint256)",
  "function hasProposed(uint256 roundId, address account) view returns (bool)",
  "function fund(uint256 roundId) payable",
  "function propose(string title, string tldr, string body) returns (uint256)",
  "function vote(uint256 proposalId, uint256 weight)",
  "function voteBatch(uint256[] proposalIds, uint256[] weights)",
  "function settle(uint256 roundId)",
  "function withdraw()",
  "function pendingWithdrawals(address account) view returns (uint256)",
  "function pendingSettlements() view returns (uint256)",
]);

export enum Phase {
  Proposing = 0,
  Voting = 1,
  Ended = 2,
  Finalized = 3,
}

// Kontrattaki sabitlerle ayni. Arayuz, zincire sormadan faz hesaplayabilsin diye.
export const ROUND_LENGTH = 24 * 3600;
export const PROPOSING_LENGTH = 16 * 3600;
export const NUM_WINNERS = 3;
