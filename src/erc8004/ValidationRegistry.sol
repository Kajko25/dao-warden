// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title ValidationRegistry — a validation registry per ERC-8004 (Trustless Agents)
/// @notice Carries BOTH of DAO-WARDEN's Stage 6 functions at once:
///         1. **An auditable decision trail** — the agent files a `validationRequest` for
///            EVERY evaluated proposal: `requestURI` points to the decision record (what it
///            flagged and why, on IPFS), and `requestHash` is the keccak256 of that record
///            (a cryptographic commitment — the decision cannot be silently changed later).
///         2. **A reputation signal from a validator** — an independent validator wallet
///            answers with a `validationResponse` scored 0-100 (0 = the decision is wrong,
///            100 = fully confirmed). `getSummary` aggregates this into the agent's reputation.
/// @dev    Fidelity vs. the spec: we use `constructor(identityRegistry)` instead of the
///         `initialize` pattern (no proxy — simpler deploy). The rest of the signatures
///         (`validationRequest`, `validationResponse`, `getValidationStatus`, `getSummary`,
///         `getAgentValidations`, `getValidatorRequests`) are compliant.
contract ValidationRegistry {
    IIdentityRegistry public immutable identityRegistry;

    struct Request {
        address validatorAddress; // != 0 => the request exists
        uint256 agentId;
        uint8 response; // the validator's latest score (0-100)
        bool answered;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
    }

    mapping(bytes32 => Request) private _requests;
    mapping(uint256 => bytes32[]) private _agentValidations;
    mapping(address => bytes32[]) private _validatorRequests;

    event ValidationRequest(
        address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash
    );
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    constructor(address identityRegistry_) {
        require(identityRegistry_ != address(0), "ValidationRegistry: zero identity");
        identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    // --- Validation request (filed by the agent owner) ----------------------

    /// @notice The agent (owner of `agentId`) registers a decision for validation.
    /// @param validatorAddress the wallet authorized to respond
    /// @param agentId          the agent filing the request (must be its owner)
    /// @param requestURI       the address of the off-chain decision record (e.g. ipfs://...)
    /// @param requestHash      keccak256 of the canonical decision record (the commitment)
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(identityRegistry.ownerOf(agentId) == msg.sender, "ValidationRegistry: not agent owner");
        require(validatorAddress != address(0), "ValidationRegistry: zero validator");
        require(requestHash != bytes32(0), "ValidationRegistry: zero hash");
        require(_requests[requestHash].validatorAddress == address(0), "ValidationRegistry: request exists");

        _requests[requestHash] = Request({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            answered: false,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp
        });
        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    // --- Validator response (the reputation signal) -------------------------

    /// @notice The validator scores a previously filed decision. `response` 0-100.
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        Request storage r = _requests[requestHash];
        require(r.validatorAddress != address(0), "ValidationRegistry: unknown request");
        require(msg.sender == r.validatorAddress, "ValidationRegistry: not validator");
        require(response <= 100, "ValidationRegistry: response > 100");

        r.response = response;
        r.answered = true;
        r.responseHash = responseHash;
        r.tag = tag;
        r.lastUpdate = block.timestamp;

        emit ValidationResponse(r.validatorAddress, r.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    // --- Reads ---------------------------------------------------------------

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        Request storage r = _requests[requestHash];
        return (r.validatorAddress, r.agentId, r.response, r.responseHash, r.tag, r.lastUpdate);
    }

    /// @notice An agent's reputation aggregate: the number of ANSWERED validations and the average score.
    /// @param validatorAddresses a validator filter (empty list => all)
    /// @param tag                a tag filter (empty => any)
    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] storage hashes = _agentValidations[agentId];
        uint256 sum;
        bytes32 tagHash = keccak256(bytes(tag));
        bool anyTag = bytes(tag).length == 0;

        for (uint256 i = 0; i < hashes.length; i++) {
            Request storage r = _requests[hashes[i]];
            if (!r.answered) continue;
            if (!anyTag && keccak256(bytes(r.tag)) != tagHash) continue;
            if (validatorAddresses.length > 0 && !_contains(validatorAddresses, r.validatorAddress)) continue;
            sum += r.response;
            count++;
        }
        averageResponse = count == 0 ? 0 : uint8(sum / count);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    function _contains(address[] calldata set, address a) private pure returns (bool) {
        for (uint256 i = 0; i < set.length; i++) {
            if (set[i] == a) return true;
        }
        return false;
    }
}
