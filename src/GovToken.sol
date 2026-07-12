// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title GovToken — token glosujacy DAO (ERC20Votes)
/// @notice Token nadaje sile glosu. ERC20Votes zapisuje "checkpointy": migawki
///         (timepoint => sila glosu adresu). Governor przy tworzeniu propozycji
///         robi snapshot na konkretny timepoint i kazdy glosuje sila z tej migawki,
///         a nie biezaca — dlatego kupno tokenow PO snapshocie nie wplywa na
///         trwajaca propozycje (ale wplywa na nastepna — tak dzialal atak BONK).
/// @dev    UWAGA na checkpointy: sila glosu nie aktualizuje sie automatycznie przy
///         transferze. Adres musi najpierw wywolac `delegate(...)` (choćby na
///         samego siebie), zeby jego saldo w ogole liczylo sie jako glosy.
contract GovToken is ERC20, ERC20Permit, ERC20Votes {
    /// @param initialHolder adres, ktory dostaje caly poczatkowy supply
    /// @param initialSupply calkowity supply (w jednostkach bazowych, 18 decimals)
    constructor(address initialHolder, uint256 initialSupply)
        ERC20("DAO Warden Gov Token", "WGOV")
        ERC20Permit("DAO Warden Gov Token")
    {
        _mint(initialHolder, initialSupply);
    }

    // --- Zegar: tryb TIMESTAMP zamiast domyslnego numeru bloku ---
    // Na Arc blok trwa ~0.5s, wiec liczenie okresow w blokach jest niewygodne i
    // zalezne od zmiennego czasu bloku. Timestamp daje okresy w sekundach.
    // Token i Governor MUSZA miec ten sam zegar — Governor (GovernorVotes) czyta
    // token().clock(), wiec wystarczy nadpisac to tutaj.

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // --- Override'y wymagane przez diament dziedziczenia (ERC20 + Permit + Votes) ---
    // Oba rodzice definiuja _update / nonces; Solidity wymaga jawnego rozstrzygniecia.

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
