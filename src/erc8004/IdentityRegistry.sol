// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title IdentityRegistry — an agent identity registry per ERC-8004 (Trustless Agents)
/// @notice The subset of ERC-8004 used by DAO-WARDEN. Each agent is an ERC-721 token:
///         `agentId` == `tokenId`, and `tokenURI` points to the AgentCard (JSON on IPFS,
///         `registration-v1` format). The token owner is the wallet that performed the
///         registration — it controls the agent's metadata and URI.
/// @dev    Fidelity vs. the full spec: we implement `register`, `setAgentURI`,
///         `getMetadata/setMetadata`, `getAgentWallet` and the events. The
///         `setAgentWallet` variant with an EIP-712 signature (the new wallet confirms
///         consent) is OMITTED — in our demo the agent wallet == the token owner, so
///         `getAgentWallet` returns `ownerOf` by default. The simplification is described
///         in the docs.
contract IdentityRegistry is ERC721URIStorage {
    /// @notice A metadata key-value pair stored at (or after) registration.
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    /// @dev agentIds are assigned incrementally from 1 (0 is reserved as "none").
    uint256 private _nextId = 1;

    /// @dev agentId => metadata key => value
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    /// @dev Optional agent-wallet override. 0 => use `ownerOf(agentId)`.
    mapping(uint256 => address) private _agentWallet;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    constructor() ERC721("ERC-8004 Trustless Agent", "AGENT") {}

    /// @dev Only the agent owner (or an approved operator) may modify it.
    modifier onlyAgentOwner(uint256 agentId) {
        require(_isAuthorized(_ownerOf(agentId), msg.sender, agentId), "IdentityRegistry: not agent owner");
        _;
    }

    // --- Registration --------------------------------------------------------

    /// @notice Registers an agent with a card URI and a set of metadata. Returns `agentId`.
    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        agentId = _register(agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    /// @notice Registers an agent with only a card URI (no on-chain metadata).
    function register(string calldata agentURI) external returns (uint256 agentId) {
        return _register(agentURI);
    }

    function _register(string calldata agentURI) private returns (uint256 agentId) {
        agentId = _nextId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
    }

    // --- URI and metadata ----------------------------------------------------

    /// @notice Updates the agent's card URI (e.g. after changing the AgentCard on IPFS).
    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @notice Sets a single metadata pair for the agent.
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external
        onlyAgentOwner(agentId)
    {
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function _setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) private {
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    /// @notice Reads a metadata value. Empty `bytes` => the key is unset.
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    // --- Agent wallet --------------------------------------------------------

    /// @notice Returns the agent's operational wallet: the override, or the token owner by default.
    function getAgentWallet(uint256 agentId) external view returns (address) {
        address override_ = _agentWallet[agentId];
        return override_ == address(0) ? ownerOf(agentId) : override_;
    }

    /// @notice A simple wallet override (owner only). The full variant with an EIP-712
    ///         signature from the new wallet is out of scope for this demonstration.
    function setAgentWallet(uint256 agentId, address newWallet) external onlyAgentOwner(agentId) {
        _agentWallet[agentId] = newWallet;
    }

    // --- Helpers -------------------------------------------------------------

    /// @notice How many agents have been registered (the next id assigned = totalRegistered + 1).
    function totalRegistered() external view returns (uint256) {
        return _nextId - 1;
    }
}
