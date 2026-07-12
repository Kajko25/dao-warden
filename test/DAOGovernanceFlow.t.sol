// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

/// @notice Stage 1 — local test: confirms the contracts compile and the basic governance
///         cycle (mint -> delegate -> propose -> vote -> execute) works. Also checks two
///         design decisions: the timestamp clock mode and the 1%-of-supply quorum. The
///         golden test of the ATTACK itself comes in Stage 2.
contract DAOGovernanceFlowTest is Test {
    GovToken internal token;
    DAOGovernor internal gov;
    Treasury internal treasury;
    MockERC20 internal asset;

    address internal dao = makeAddr("dao"); // the initial holder of the entire WGOV supply
    address internal recipient = makeAddr("recipient"); // the treasury payout recipient

    uint256 internal constant SUPPLY = 1_000_000e18; // 1M WGOV
    uint48 internal constant VOTING_DELAY = 1 minutes; // 60s (clock = timestamp)
    uint32 internal constant VOTING_PERIOD = 1 hours; // 3600s
    uint256 internal constant QUORUM_PCT = 1; // 1% of supply
    uint256 internal constant TREASURY_FUNDS = 500_000e6; // 500k mUSD (6 decimals)

    function setUp() public {
        // The Governor's clock = block.timestamp, so we set a realistic starting point
        // (foundry's default timestamp=1 would break past-checkpoint lookups).
        vm.warp(1_800_000_000);

        token = new GovToken(dao, SUPPLY);
        gov = new DAOGovernor(IVotes(address(token)), VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT);
        // The treasury owner is the Governor — only it can order a withdrawal.
        treasury = new Treasury(address(gov));

        asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);
    }

    // --- Design decisions ---

    function test_ClockModeIsTimestamp() public view {
        assertEq(token.clock(), uint48(block.timestamp), "token clock != timestamp");
        assertEq(gov.clock(), uint48(block.timestamp), "governor clock != timestamp");
        assertEq(token.CLOCK_MODE(), "mode=timestamp");
        // The Governor inherits the clock mode from the token (GovernorVotes reads token().clock())
        assertEq(gov.CLOCK_MODE(), "mode=timestamp");
    }

    function test_QuorumIsOnePercentOfSupply() public {
        vm.warp(block.timestamp + 10); // move the clock so we can query a past timepoint
        uint256 expected = SUPPLY * QUORUM_PCT / 100; // 1% of 1M = 10_000e18
        assertEq(gov.quorum(block.timestamp - 1), expected, "quorum != 1% of supply");
    }

    function test_TreasuryOwnedByGovernor() public view {
        assertEq(treasury.owner(), address(gov));
        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS);
    }

    // --- Full governance cycle ---

    function test_FullFlow_MintDelegateProposeVoteExecute() public {
        uint256 payout = 100_000e6; // how much mUSD the proposal withdraws

        // 1) DELEGATION — without it a balance does NOT count as voting power.
        //    dao delegates to itself -> creates a voting-power checkpoint.
        vm.prank(dao);
        token.delegate(dao);
        assertEq(token.getVotes(dao), SUPPLY, "delegation did not grant voting power");

        // Move forward by "one clock tick" so the delegation is in the past relative to
        // the proposal's snapshot (the Governor compares voting power at a past timepoint).
        vm.warp(block.timestamp + 1);

        // 2) PROPOSAL — a withdrawal from the treasury to recipient.
        (
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory calldatas,
            string memory description
        ) = _buildWithdrawProposal(payout);

        vm.prank(dao);
        uint256 proposalId = gov.propose(targets, values, calldatas, description);
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Pending),
            "should be Pending after submission"
        );

        // 3) VOTING — wait for the end of votingDelay (voting start).
        vm.warp(gov.proposalSnapshot(proposalId) + 1);
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Active),
            "should be Active after votingDelay"
        );

        vm.prank(dao);
        gov.castVote(proposalId, 1); // 1 = For

        // 4) END OF VOTING — after the deadline state = Succeeded (quorum + For majority).
        vm.warp(gov.proposalDeadline(proposalId) + 1);
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Succeeded),
            "should be Succeeded after the deadline"
        );

        // 5) EXECUTION — no timelock, so execute runs immediately.
        uint256 recipientBefore = asset.balanceOf(recipient);
        gov.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(asset.balanceOf(recipient) - recipientBefore, payout, "recipient did not get the payout");
        assertEq(
            treasury.balanceOf(address(asset)),
            TREASURY_FUNDS - payout,
            "treasury balance did not drop by the payout"
        );
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Executed),
            "should be Executed after execute"
        );
    }

    /// @dev Builds the proposal: Treasury.withdraw(asset, recipient, amount).
    function _buildWithdrawProposal(uint256 amount)
        internal
        view
        returns (
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory calldatas,
            string memory description
        )
    {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);

        targets[0] = address(treasury);
        values[0] = 0;
        calldatas[0] = abi.encodeCall(Treasury.withdraw, (address(asset), recipient, amount));
        description = "Operational treasury payout";
    }
}
