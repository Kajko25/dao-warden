// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

/// @notice Etap 1 — test lokalny: potwierdza, ze kontrakty sie kompiluja i podstawowy
///         cykl zarzadzania (mint -> delegacja -> propozycja -> glos -> wykonanie)
///         dziala. Sprawdza tez dwie decyzje projektowe: zegar w trybie timestamp
///         oraz kworum = 1% supply. Golden test samego ATAKU przyjdzie w Etapie 2.
contract DAOGovernanceFlowTest is Test {
    GovToken internal token;
    DAOGovernor internal gov;
    Treasury internal treasury;
    MockERC20 internal asset;

    address internal dao = makeAddr("dao"); // poczatkowy holder calego supply WGOV
    address internal recipient = makeAddr("recipient"); // odbiorca wyplaty z treasury

    uint256 internal constant SUPPLY = 1_000_000e18; // 1 mln WGOV
    uint48 internal constant VOTING_DELAY = 1 minutes; // 60s (zegar = timestamp)
    uint32 internal constant VOTING_PERIOD = 1 hours; // 3600s
    uint256 internal constant QUORUM_PCT = 1; // 1% supply
    uint256 internal constant TREASURY_FUNDS = 500_000e6; // 500k mUSD (6 decimals)

    function setUp() public {
        // Zegar Governora = block.timestamp, wiec ustawiamy realistyczny punkt startowy
        // (domyslne foundry timestamp=1 psuloby lookupy checkpointow w przeszlosci).
        vm.warp(1_800_000_000);

        token = new GovToken(dao, SUPPLY);
        gov = new DAOGovernor(IVotes(address(token)), VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT);
        // Wlascicielem skarbca jest Governor — tylko on moze zlecic wyplate.
        treasury = new Treasury(address(gov));

        asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);
    }

    // --- Decyzje projektowe ---

    function test_ClockModeIsTimestamp() public view {
        assertEq(token.clock(), uint48(block.timestamp), "zegar tokena != timestamp");
        assertEq(gov.clock(), uint48(block.timestamp), "zegar governora != timestamp");
        assertEq(token.CLOCK_MODE(), "mode=timestamp");
        // Governor dziedziczy tryb zegara z tokena (GovernorVotes czyta token().clock())
        assertEq(gov.CLOCK_MODE(), "mode=timestamp");
    }

    function test_QuorumIsOnePercentOfSupply() public {
        vm.warp(block.timestamp + 10); // przesuwamy zegar, by pytac o punkt w przeszlosci
        uint256 expected = SUPPLY * QUORUM_PCT / 100; // 1% z 1 mln = 10_000e18
        assertEq(gov.quorum(block.timestamp - 1), expected, "kworum != 1% supply");
    }

    function test_TreasuryOwnedByGovernor() public view {
        assertEq(treasury.owner(), address(gov));
        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS);
    }

    // --- Pelny cykl zarzadzania ---

    function test_FullFlow_MintDelegateProposeVoteExecute() public {
        uint256 payout = 100_000e6; // ile mUSD wyplacamy propozycja

        // 1) DELEGACJA — bez niej saldo NIE liczy sie jako sila glosu.
        //    dao deleguje na samego siebie -> tworzy checkpoint sily glosu.
        vm.prank(dao);
        token.delegate(dao);
        assertEq(token.getVotes(dao), SUPPLY, "delegacja nie nadala sily glosu");

        // Cofamy sie o "krok zegara", by delegacja byla w przeszlosci wzgledem
        // snapshotu propozycji (Governor porownuje sile glosu z przeszlego timepointu).
        vm.warp(block.timestamp + 1);

        // 2) PROPOZYCJA — wyplata z treasury na recipient.
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
            "po zlozeniu powinno byc Pending"
        );

        // 3) GLOSOWANIE — czekamy na koniec votingDelay (start glosowania).
        vm.warp(gov.proposalSnapshot(proposalId) + 1);
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Active),
            "po votingDelay powinno byc Active"
        );

        vm.prank(dao);
        gov.castVote(proposalId, 1); // 1 = For

        // 4) KONIEC GLOSOWANIA — po deadline stan = Succeeded (kworum + wiekszosc For).
        vm.warp(gov.proposalDeadline(proposalId) + 1);
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Succeeded),
            "po deadline powinno byc Succeeded"
        );

        // 5) WYKONANIE — brak timelocka, wiec execute dziala natychmiast.
        uint256 recipientBefore = asset.balanceOf(recipient);
        gov.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(asset.balanceOf(recipient) - recipientBefore, payout, "recipient nie dostal wyplaty");
        assertEq(
            treasury.balanceOf(address(asset)),
            TREASURY_FUNDS - payout,
            "saldo treasury nie spadlo o wyplate"
        );
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Executed),
            "po execute powinno byc Executed"
        );
    }

    /// @dev Buduje propozycje: Treasury.withdraw(asset, recipient, amount).
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
        description = "Wyplata operacyjna z treasury";
    }
}
