// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title ValidationRegistry — rejestr walidacji wg ERC-8004 (Trustless Agents)
/// @notice Nosi DWIE funkcje Etapu 6 DAO-WARDEN naraz:
///         1. **Audytowalny slad decyzji** — agent sklada `validationRequest` dla
///            KAZDEJ ocenionej propozycji: `requestURI` wskazuje na rekord decyzji
///            (co oflagowal i dlaczego, na IPFS), a `requestHash` to keccak256 tego
///            rekordu (zobowiazanie kryptograficzne — decyzji nie da sie pozniej po
///            cichu zmienic).
///         2. **Sygnal reputacji od walidatora** — niezalezny portfel walidatora
///            odpowiada `validationResponse` z ocena 0-100 (0 = decyzja bledna,
///            100 = w pelni potwierdzona). `getSummary` agreguje to w reputacje agenta.
/// @dev    Wiernosc vs. specyfikacja: uzywamy `constructor(identityRegistry)` zamiast
///         wzorca `initialize` (brak proxy — prostszy deploy). Reszta sygnatur
///         (`validationRequest`, `validationResponse`, `getValidationStatus`,
///         `getSummary`, `getAgentValidations`, `getValidatorRequests`) jest zgodna.
contract ValidationRegistry {
    IIdentityRegistry public immutable identityRegistry;

    struct Request {
        address validatorAddress; // != 0 => zadanie istnieje
        uint256 agentId;
        uint8 response; // ostatnia ocena walidatora (0-100)
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

    // --- Zadanie walidacji (sklada wlasciciel agenta) ------------------------

    /// @notice Agent (wlasciciel `agentId`) rejestruje decyzje do walidacji.
    /// @param validatorAddress portfel uprawniony do odpowiedzi
    /// @param agentId          agent skladajacy zadanie (musi byc jego wlascicielem)
    /// @param requestURI       adres rekordu decyzji off-chain (np. ipfs://...)
    /// @param requestHash      keccak256 kanonicznego rekordu decyzji (zobowiazanie)
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

    // --- Odpowiedz walidatora (sygnal reputacji) ----------------------------

    /// @notice Walidator ocenia wczesniej zlozona decyzje. `response` 0-100.
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

    // --- Odczyty -------------------------------------------------------------

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

    /// @notice Agregat reputacji agenta: liczba ODPOWIEDZIANYCH walidacji i srednia ocena.
    /// @param validatorAddresses filtr walidatorow (pusta lista => wszyscy)
    /// @param tag                filtr tagu (pusty => dowolny)
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
