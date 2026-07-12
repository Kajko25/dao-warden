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

/// @title DAOGovernorTimelocked — the MITIGATED variant (Stage 7)
/// @notice A controlled experiment: we change EXACTLY ONE variable relative to the
///         vulnerable DAOGovernor — we add a timelock (GovernorTimelockControl).
///         The 1% quorum and proposalThreshold=0 stay UNCHANGED, so the proof is clean:
///         it is the timelock itself that stops the BONK-class attack, not other parameters.
///
///         How the proposal lifecycle changes:
///           vulnerable:      Succeeded -> execute() immediately (zero defense window)
///           with timelock:   Succeeded -> queue() -> [minDelay window] -> execute()
///         In the minDelay window anyone with CANCELLER_ROLE on the timelock (here: the
///         agent) can cancel the operation — the Governor sees it and reports Canceled.
///
/// @dev    IMPORTANT ownership shift: with GovernorTimelockControl it is the TIMELOCK
///         (not the Governor) that executes proposal transactions, so the Treasury owner
///         must be the timelock's address. The Governor gets PROPOSER_ROLE on the timelock
///         (queues won proposals); execution is open (executor=address(0)).
contract DAOGovernorTimelocked is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /// @param token            the voting token (ERC20Votes, timestamp clock)
    /// @param timelockAddress  the TimelockController that execution passes through
    /// @param votingDelaySec   seconds from proposal submission to the voting start
    /// @param votingPeriodSec  seconds that voting lasts
    /// @param quorumPercent    the percent of supply for quorum (deliberately still 1)
    constructor(
        IVotes token,
        TimelockController timelockAddress,
        uint48 votingDelaySec,
        uint32 votingPeriodSec,
        uint256 quorumPercent
    )
        Governor("DAOGovernorTimelocked")
        GovernorSettings(votingDelaySec, votingPeriodSec, 0 /* threshold deliberately 0 */)
        GovernorVotes(token)
        GovernorVotesQuorumFraction(quorumPercent)
        GovernorTimelockControl(timelockAddress)
    {}

    // --- Overrides required when combining extensions ---

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

    // --- Overrides required by GovernorTimelockControl ---
    // (wiring the Governor's state/execution to the timelock queue)

    /// @dev Proposal state that accounts for the timelock: if a queued operation is
    ///      cancelled directly on the timelock (the guardian-agent path), the Governor
    ///      reports Canceled and execute() becomes impossible.
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

    /// @dev The executor is the timelock — it holds the permissions (Treasury owner).
    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }
}
