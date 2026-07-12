// The minimal ABIs the agent needs (only what we read).

// Governor — the ProposalCreated event + functions to read state and parameters.
export const governorAbi = [
  {
    type: "event",
    name: "ProposalCreated",
    inputs: [
      { name: "proposalId", type: "uint256", indexed: false },
      { name: "proposer", type: "address", indexed: false },
      { name: "targets", type: "address[]", indexed: false },
      { name: "values", type: "uint256[]", indexed: false },
      { name: "signatures", type: "string[]", indexed: false },
      { name: "calldatas", type: "bytes[]", indexed: false },
      { name: "voteStart", type: "uint256", indexed: false },
      { name: "voteEnd", type: "uint256", indexed: false },
      { name: "description", type: "string", indexed: false },
    ],
  },
  { type: "function", name: "state", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "quorumNumerator", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "proposalProposer", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "proposalDeadline", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "proposalVotes", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ name: "against", type: "uint256" }, { name: "for", type: "uint256" }, { name: "abstain", type: "uint256" }] },
  // Agent reaction (Stage 5): casting a vote. support: 0=Against(NO), 1=For, 2=Abstain.
  { type: "function", name: "castVote", stateMutability: "nonpayable", inputs: [{ name: "proposalId", type: "uint256" }, { name: "support", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasVoted", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  // Proposal lifecycle (used by the demo scenario — the attacker role).
  { type: "function", name: "propose", stateMutability: "nonpayable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "description", type: "string" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hashProposal", stateMutability: "pure", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  // Timelocked variant (Stage 7): a won proposal must first be queued.
  { type: "function", name: "queue", stateMutability: "nonpayable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "proposalNeedsQueuing", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "timelock", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// TimelockController — the Stage 7 defense layer. The agent (CANCELLER_ROLE) cancels
// the queued attack operation in the minDelay window.
export const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hashOperationBatch", stateMutability: "pure", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" }, { name: "salt", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "isOperationPending", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isOperationReady", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "getTimestamp", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "id", type: "bytes32" }], outputs: [] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "CANCELLER_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

// The quorum denominator in OZ GovernorVotesQuorumFraction is a constant 100 (percent).
export const QUORUM_DENOMINATOR = 100n;

// ERC20Votes — voting power + supply + delegation.
export const votesTokenAbi = [
  { type: "function", name: "getVotes", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "delegate", stateMutability: "nonpayable", inputs: [{ name: "delegatee", type: "address" }], outputs: [] },
  { type: "function", name: "delegates", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address" }] },
] as const;

// ERC20 (the treasury asset) — balance + metadata.
export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// Treasury — the signature the agent recognizes as a fund movement out of the treasury.
export const treasuryAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
