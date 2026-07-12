// Minimalne ABI potrzebne agentowi (tylko to, co czytamy w Etapie 3).

// Governor — event ProposalCreated + funkcje odczytu stanu i parametrow.
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
  // Reakcja agenta (Etap 5): oddanie glosu. support: 0=Against(NIE), 1=For, 2=Abstain.
  { type: "function", name: "castVote", stateMutability: "nonpayable", inputs: [{ name: "proposalId", type: "uint256" }, { name: "support", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasVoted", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  // Cykl propozycji (uzywane przez scenariusz demonstracyjny — role attacker).
  { type: "function", name: "propose", stateMutability: "nonpayable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "description", type: "string" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hashProposal", stateMutability: "pure", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  // Wariant z timelockiem (Etap 7): wygrana propozycja musi byc najpierw zakolejkowana.
  { type: "function", name: "queue", stateMutability: "nonpayable", inputs: [{ name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" }, { name: "calldatas", type: "bytes[]" }, { name: "descriptionHash", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "proposalNeedsQueuing", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "timelock", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// TimelockController — warstwa obronna Etapu 7. Agent (CANCELLER_ROLE) anuluje
// zakolejkowana operacje ataku w oknie minDelay.
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

// Denominator kworum w OZ GovernorVotesQuorumFraction to stale 100 (procent).
export const QUORUM_DENOMINATOR = 100n;

// ERC20Votes — sila glosu + supply + delegacja.
export const votesTokenAbi = [
  { type: "function", name: "getVotes", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "delegate", stateMutability: "nonpayable", inputs: [{ name: "delegatee", type: "address" }], outputs: [] },
  { type: "function", name: "delegates", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address" }] },
] as const;

// ERC20 (aktywo skarbca) — saldo + metadane.
export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// Treasury — sygnatura, ktora agent rozpoznaje jako ruch srodkow ze skarbca.
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
