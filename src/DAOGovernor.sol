// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from
    "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from
    "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title DAOGovernor — CELOWO PODATNY Governor (odtwarza klase podatnosci BONK)
/// @notice Trzy decyzje projektowe skladaja sie na podatnosc:
///         1. Kworum ~1% supply (GovernorVotesQuorumFraction, numerator=1, denom=100)
///            -> propozycja przechodzi przy skrajnie niskiej frekwencji.
///         2. proposalThreshold = 0 -> KAZDY moze zlozyc propozycje, bez progu tokenow.
///         3. BRAK timelocka (nie dziedziczymy GovernorTimelockControl) -> po
///            zakonczeniu glosowania `execute` dziala natychmiast, zero okna obronnego.
/// @dev    Zegar dziedziczy z tokena (GovernorVotes.clock() czyta token().clock()),
///         a nasz GovToken jest w trybie timestamp -> votingDelay/votingPeriod w SEKUNDACH.
contract DAOGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction
{
    /// @param token token glosujacy (ERC20Votes)
    /// @param votingDelaySec  ile sekund od zlozenia propozycji do startu glosowania
    ///                        (moment snapshotu sily glosu)
    /// @param votingPeriodSec ile sekund trwa glosowanie
    /// @param quorumPercent   procent supply potrzebny na kworum (np. 1 = 1%)
    constructor(
        IVotes token,
        uint48 votingDelaySec,
        uint32 votingPeriodSec,
        uint256 quorumPercent
    )
        Governor("DAOGovernor")
        GovernorSettings(votingDelaySec, votingPeriodSec, 0 /* proposalThreshold = 0 */)
        GovernorVotes(token)
        GovernorVotesQuorumFraction(quorumPercent)
    {}

    // --- Override'y wymagane przy laczeniu rozszerzen ---

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function quorum(uint256 timepoint)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(timepoint);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }
}
