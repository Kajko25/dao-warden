// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title IdentityRegistry — rejestr tozsamosci agentow wg ERC-8004 (Trustless Agents)
/// @notice Podzbior ERC-8004 uzywany przez DAO-WARDEN. Kazdy agent to token ERC-721:
///         `agentId` == `tokenId`, a `tokenURI` wskazuje na AgentCard (JSON na IPFS,
///         format `registration-v1`). Wlascicielem tokenu jest portfel, ktory dokonal
///         rejestracji — to on kontroluje metadane i URI agenta.
/// @dev    Wiernosc vs. pelna specyfikacja: implementujemy `register`, `setAgentURI`,
///         `getMetadata/setMetadata`, `getAgentWallet` oraz zdarzenia. Wariant
///         `setAgentWallet` z podpisem EIP-712 (nowy portfel potwierdza zgode) jest
///         POMINIETY — w naszym demie portfel agenta == wlasciciel tokenu, wiec
///         `getAgentWallet` domyslnie zwraca `ownerOf`. Uproszczenie opisane w docs.
contract IdentityRegistry is ERC721URIStorage {
    /// @notice Para klucz-wartosc metadanych zapisywanych przy (lub po) rejestracji.
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    /// @dev agentId sa nadawane rosnaco od 1 (0 rezerwujemy jako "brak").
    uint256 private _nextId = 1;

    /// @dev agentId => klucz metadanych => wartosc
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    /// @dev Opcjonalny override portfela agenta. 0 => uzyj `ownerOf(agentId)`.
    mapping(uint256 => address) private _agentWallet;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    constructor() ERC721("ERC-8004 Trustless Agent", "AGENT") {}

    /// @dev Tylko wlasciciel agenta (lub zatwierdzony operator) moze go modyfikowac.
    modifier onlyAgentOwner(uint256 agentId) {
        require(_isAuthorized(_ownerOf(agentId), msg.sender, agentId), "IdentityRegistry: not agent owner");
        _;
    }

    // --- Rejestracja ---------------------------------------------------------

    /// @notice Rejestruje agenta z URI karty i zestawem metadanych. Zwraca `agentId`.
    function register(string calldata agentURI, MetadataEntry[] calldata metadata)
        external
        returns (uint256 agentId)
    {
        agentId = _register(agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    /// @notice Rejestruje agenta tylko z URI karty (bez metadanych on-chain).
    function register(string calldata agentURI) external returns (uint256 agentId) {
        return _register(agentURI);
    }

    function _register(string calldata agentURI) private returns (uint256 agentId) {
        agentId = _nextId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        emit Registered(agentId, agentURI, msg.sender);
    }

    // --- URI i metadane ------------------------------------------------------

    /// @notice Aktualizuje URI karty agenta (np. po zmianie AgentCard na IPFS).
    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    /// @notice Ustawia pojedyncza pare metadanych dla agenta.
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

    /// @notice Odczytuje wartosc metadanych. Pusty `bytes` => klucz nieustawiony.
    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    // --- Portfel agenta ------------------------------------------------------

    /// @notice Zwraca portfel operacyjny agenta: override, a domyslnie wlasciciela tokenu.
    function getAgentWallet(uint256 agentId) external view returns (address) {
        address override_ = _agentWallet[agentId];
        return override_ == address(0) ? ownerOf(agentId) : override_;
    }

    /// @notice Prosty override portfela (tylko wlasciciel). Pelny wariant z podpisem
    ///         EIP-712 nowego portfela jest poza zakresem demonstracji.
    function setAgentWallet(uint256 agentId, address newWallet) external onlyAgentOwner(agentId) {
        _agentWallet[agentId] = newWallet;
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// @notice Ile agentow zarejestrowano (kolejny nadany id = totalRegistered + 1).
    function totalRegistered() external view returns (uint256) {
        return _nextId - 1;
    }
}
