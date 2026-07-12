// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from
    "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from
    "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from
    "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title DAOGovernorTimelocked — wariant ZMITYGOWANY (Etap 7)
/// @notice Eksperyment kontrolowany: zmieniamy DOKLADNIE JEDNA zmienna wzgledem
///         podatnego DAOGovernor — dodajemy timelock (GovernorTimelockControl).
///         Kworum 1% i proposalThreshold=0 zostaja BEZ ZMIAN, zeby dowod byl czysty:
///         to sam timelock zatrzymuje atak klasy BONK, a nie inne parametry.
///
///         Jak zmienia sie cykl zycia propozycji:
///           podatny:      Succeeded -> execute() natychmiast (zero okna obronnego)
///           z timelockiem: Succeeded -> queue() -> [okno minDelay] -> execute()
///         W oknie minDelay kazdy z rola CANCELLER_ROLE na timelocku (u nas: agent)
///         moze anulowac operacje — Governor zobaczy to i zaraportuje Canceled.
///
/// @dev    WAZNE przesuniecie wlasnosci: przy GovernorTimelockControl to TIMELOCK
///         (nie Governor) wykonuje transakcje propozycji, wiec owner Treasury musi
///         byc adres timelocka. Governor dostaje na timelocku PROPOSER_ROLE
///         (kolejkuje wygrane propozycje); egzekucja jest otwarta (executor=address(0)).
contract DAOGovernorTimelocked is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /// @param token            token glosujacy (ERC20Votes, zegar timestamp)
    /// @param timelockAddress  TimelockController, przez ktory przechodzi egzekucja
    /// @param votingDelaySec   sekundy od zlozenia propozycji do startu glosowania
    /// @param votingPeriodSec  sekundy trwania glosowania
    /// @param quorumPercent    procent supply na kworum (celowo wciaz 1)
    constructor(
        IVotes token,
        TimelockController timelockAddress,
        uint48 votingDelaySec,
        uint32 votingPeriodSec,
        uint256 quorumPercent
    )
        Governor("DAOGovernorTimelocked")
        GovernorSettings(votingDelaySec, votingPeriodSec, 0 /* threshold celowo 0 */)
        GovernorVotes(token)
        GovernorVotesQuorumFraction(quorumPercent)
        GovernorTimelockControl(timelockAddress)
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

    // --- Override'y wymagane przez GovernorTimelockControl ---
    // (laczenie stanu/egzekucji Governora z kolejka timelocka)

    /// @dev Stan propozycji z uwzglednieniem timelocka: jesli operacja w kolejce
    ///      zostala anulowana bezposrednio na timelocku (sciezka agenta-straznika),
    ///      Governor raportuje Canceled i execute() jest niemozliwe.
    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    /// @dev Egzekutorem jest timelock — to on trzyma uprawnienia (owner Treasury).
    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
