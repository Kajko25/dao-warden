// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernorTimelocked} from "../src/DAOGovernorTimelocked.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Stage 7 — the mitigation golden test. We reproduce an IDENTICAL attack to Stage 2
///         (the same allocations: attacker 50k WGOV, honest 100k but APATHETIC — does not
///         vote; quorum 1%, threshold 0), with only one variable changed: execution goes
///         through a TimelockController.
///
///         The Stage 7 thesis: the timelock does NOT stop the attack by itself — it creates a
///         DEFENSE WINDOW after a won vote. It is only stopped by someone who reacts in that
///         window (here: the guardian agent with CANCELLER_ROLE). Hence four proofs:
///           1) the attack cannot be executed immediately after Succeeded (the end of the
///              "drain in a single transaction" from Stage 2),
///           2) in the delay window the agent cancels the operation -> treasury intact,
///           3) HONESTLY: without cancellation the attack lands after minDelay — the window
///              must be used, delay alone is not a defense,
///           4) legitimate proposals still work (the timelock does not break governance).
contract TimelockDefenseTest is Test {
    GovToken internal token;
    TimelockController internal timelock;
    DAOGovernorTimelocked internal gov;
    Treasury internal treasury;
    MockERC20 internal asset;

    address internal attacker = makeAddr("attacker");
    address internal honest = makeAddr("honest"); // apathetic — has votes, does not vote
    address internal agent = makeAddr("agent"); // guardian with CANCELLER_ROLE
    address internal recipient = makeAddr("recipient"); // recipient of the legitimate payout

    uint256 internal constant SUPPLY = 1_000_000e18;
    uint256 internal constant ATTACKER_ALLOC = 50_000e18;
    uint256 internal constant HONEST_ALLOC = 100_000e18;
    uint256 internal constant TREASURY_FUNDS = 1_000_000e6; // 1M mUSD

    uint48 internal constant VOTING_DELAY = 60; // like the realistic variant from Stage 2
    uint32 internal constant VOTING_PERIOD = 3600;
    uint256 internal constant QUORUM_PCT = 1; // deliberately still 1%
    uint256 internal constant MIN_DELAY = 1 days; // the timelock's defense window

    function setUp() public {
        vm.warp(1_800_000_000); // a realistic clock start (timestamp checkpoints)

        token = new GovToken(address(this), SUPPLY);

        // Timelock: no proposers at the start, execution open (address(0)),
        // admin = deployer ONLY for the duration of the role wiring (then renounced).
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = new TimelockController(MIN_DELAY, proposers, executors, address(this));

        gov = new DAOGovernorTimelocked(
            IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT
        );

        // Role wiring: the Governor queues won proposals, the agent can cancel in the
        // defense window. Finally the deployer renounces admin — the timelock becomes
        // self-governed (only it is its own admin; role changes only via governance).
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(gov));
        timelock.grantRole(timelock.CANCELLER_ROLE(), agent);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        // The KEY change vs. the vulnerable variant: the treasury belongs to the TIMELOCK
        // (it executes the proposal transactions), not to the Governor.
        treasury = new Treasury(address(timelock));
        asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        // Distribution as in Stage 2: attacker 50k, honest 100k.
        token.transfer(attacker, ATTACKER_ALLOC);
        token.transfer(honest, HONEST_ALLOC);
    }

    // --- Wiring ---

    function test_WiringRolesAndOwnership() public view {
        assertEq(treasury.owner(), address(timelock), "treasury owner must be the timelock");
        assertEq(gov.timelock(), address(timelock));
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(gov)));
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), agent));
        // the deployer no longer has any power over the timelock
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(timelock.getMinDelay(), MIN_DELAY);
        assertTrue(gov.proposalNeedsQueuing(0), "every proposal must go through the queue");
    }

    // --- Proof 1: the end of the drain in a single transaction ---

    function test_Attack_CannotExecuteImmediatelyAfterSucceeded() public {
        (uint256 proposalId,,,, bytes32 descHash) = _runAttackVote();
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));

        // In Stage 2 this same moment = an immediate drain. Now: the operation is not in the
        // timelock queue, so executeBatch reverts.
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS, "treasury must be intact");
    }

    // --- Proof 2 (the core of Stage 7): the agent cancels in the defense window ---

    function test_Attack_CanceledByAgentInDefenseWindow() public {
        (uint256 proposalId,,,, bytes32 descHash) = _runAttackVote();
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();

        // The attacker queues its won proposal (queue is permissionless).
        vm.prank(attacker);
        gov.queue(t, v, c, descHash);
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Queued));

        // Attempt to execute BEFORE minDelay elapses — the timelock refuses (operation not Ready).
        vm.warp(block.timestamp + MIN_DELAY - 1);
        vm.prank(attacker);
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        // The AGENT acts in the defense window: it computes the operation id like the Governor
        // (salt = bytes20(governor address) XOR descriptionHash) and cancels it on the timelock.
        bytes32 salt = bytes20(address(gov)) ^ descHash;
        bytes32 operationId = timelock.hashOperationBatch(t, v, c, 0, salt);
        assertTrue(timelock.isOperationPending(operationId), "operation should be waiting in the queue");

        vm.prank(agent);
        timelock.cancel(operationId);

        // The Governor sees the cancellation on the timelock and reports Canceled.
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Canceled),
            "after the agent cancels, the state must be Canceled"
        );

        // Even after the full minDelay elapses the attack is dead.
        vm.warp(block.timestamp + 2);
        vm.prank(attacker);
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS, "treasury intact");
        assertEq(asset.balanceOf(attacker), 0, "the attacker got nothing");
    }

    // --- Proof 3 (honesty): delay alone is NOT a defense ---

    function test_Attack_WithoutCancellation_LandsAfterDelay() public {
        (,,,, bytes32 descHash) = _runAttackVote();
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();

        vm.prank(attacker);
        gov.queue(t, v, c, descHash);

        // Nobody reacts in the defense window...
        vm.warp(block.timestamp + MIN_DELAY + 1);
        vm.prank(attacker);
        gov.execute(t, v, c, descHash);

        // ...so the attack eventually lands. This is exactly why the timelock and the agent
        // are COMPLEMENTARY: the timelock buys time, the agent uses that time.
        assertEq(treasury.balanceOf(address(asset)), 0);
        assertEq(asset.balanceOf(attacker), TREASURY_FUNDS);
    }

    // --- Proof 4: legitimate governance still works ---

    function test_LegitProposal_ExecutesAfterDelay() public {
        uint256 payout = 100_000e6;

        vm.prank(honest);
        token.delegate(honest);
        vm.warp(block.timestamp + 1);

        (address[] memory t, uint256[] memory v, bytes[] memory c) =
            _withdrawCall(recipient, payout);
        string memory description = "Operational payout: 100k mUSD grant";
        bytes32 descHash = keccak256(bytes(description));

        vm.prank(honest);
        uint256 proposalId = gov.propose(t, v, c, description);

        vm.warp(gov.proposalSnapshot(proposalId) + 1);
        vm.prank(honest);
        gov.castVote(proposalId, 1); // For

        vm.warp(gov.proposalDeadline(proposalId) + 1);
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));

        gov.queue(t, v, c, descHash);
        vm.warp(block.timestamp + MIN_DELAY + 1);
        gov.execute(t, v, c, descHash);

        assertEq(asset.balanceOf(recipient), payout, "the recipient must receive the payout");
        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS - payout);
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Executed));
    }

    // --- Helpers: the same attack scenario as in Stage 2 ---

    /// @dev The attack proposal: withdraw the ENTIRE treasury to the attacker's address.
    function _attackProposal()
        internal
        view
        returns (
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory calldatas,
            string memory description,
            bytes32 descHash
        )
    {
        (targets, values, calldatas) = _withdrawCall(attacker, TREASURY_FUNDS);
        // The same social engineering as WGIP-1: an "operational grant" narrative masks the drain.
        description = "WGIP-T1: Operational grant for ecosystem growth";
        descHash = keccak256(bytes(description));
    }

    /// @dev Runs the attack through the end of voting: delegate -> propose -> For vote
    ///      (the honest holder is APATHETIC — does not vote) -> warp past the deadline (Succeeded).
    function _runAttackVote()
        internal
        returns (
            uint256 proposalId,
            address[] memory targets,
            uint256[] memory values,
            bytes[] memory calldatas,
            bytes32 descHash
        )
    {
        string memory description;
        (targets, values, calldatas, description, descHash) = _attackProposal();

        vm.prank(attacker);
        token.delegate(attacker);
        vm.warp(block.timestamp + 1);

        vm.prank(attacker);
        proposalId = gov.propose(targets, values, calldatas, description);

        vm.warp(gov.proposalSnapshot(proposalId) + 1);
        vm.prank(attacker);
        gov.castVote(proposalId, 1); // For — 50k > quorum 10k, nobody objects

        vm.warp(gov.proposalDeadline(proposalId) + 1);
    }

    function _withdrawCall(address to, uint256 amount)
        internal
        view
        returns (address[] memory targets, uint256[] memory values, bytes[] memory calldatas)
    {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);
        targets[0] = address(treasury);
        values[0] = 0;
        calldatas[0] = abi.encodeCall(Treasury.withdraw, (address(asset), to, amount));
    }
}
