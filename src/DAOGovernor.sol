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

/// @title DAOGovernor — a DELIBERATELY VULNERABLE Governor (reproduces the BONK vulnerability class)
/// @notice Three design decisions combine to create the vulnerability:
///         1. Quorum ~1% of supply (GovernorVotesQuorumFraction, numerator=1, denom=100)
///            -> a proposal passes at extremely low turnout.
///         2. proposalThreshold = 0 -> ANYONE can submit a proposal, with no token threshold.
///         3. NO timelock (we do not inherit GovernorTimelockControl) -> once voting ends
///            `execute` runs immediately, with zero defense window.
/// @dev    The clock is inherited from the token (GovernorVotes.clock() reads token().clock()),
///         and our GovToken is in timestamp mode -> votingDelay/votingPeriod are in SECONDS.
contract DAOGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction
{
    /// @param token          the voting token (ERC20Votes)
    /// @param votingDelaySec  seconds from proposal submission to the voting start
    ///                        (the moment of the voting-power snapshot)
    /// @param votingPeriodSec how many seconds voting lasts
    /// @param quorumPercent   the percent of supply required for quorum (e.g. 1 = 1%)
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
}
