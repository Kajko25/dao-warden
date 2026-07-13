// Minimal ABIs — the read-only subset of agent/src/abi.ts plus the ERC-8004 reads.

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
  { type: "function", name: "proposalDeadline", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "proposalVotes", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }], outputs: [{ name: "against", type: "uint256" }, { name: "for", type: "uint256" }, { name: "abstain", type: "uint256" }] },
  { type: "function", name: "hasVoted", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

// The quorum denominator in OZ GovernorVotesQuorumFraction is a constant 100 (percent).
export const QUORUM_DENOMINATOR = 100n;

export const votesTokenAbi = [
  { type: "function", name: "getVotes", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "delegates", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "address" }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

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

export const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const identityRegistryAbi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "totalRegistered", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const validationRegistryAbi = [
  { type: "function", name: "getAgentValidations", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "bytes32[]" }] },
  { type: "function", name: "getValidationStatus", stateMutability: "view", inputs: [{ name: "requestHash", type: "bytes32" }], outputs: [{ name: "validatorAddress", type: "address" }, { name: "agentId", type: "uint256" }, { name: "response", type: "uint8" }, { name: "responseHash", type: "bytes32" }, { name: "tag", type: "string" }, { name: "lastUpdate", type: "uint256" }] },
  { type: "function", name: "getSummary", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }, { name: "validatorAddresses", type: "address[]" }, { name: "tag", type: "string" }], outputs: [{ name: "count", type: "uint64" }, { name: "averageResponse", type: "uint8" }] },
] as const;
