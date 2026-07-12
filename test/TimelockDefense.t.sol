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

/// @notice Etap 7 — golden test mitygacji. Odtwarzamy IDENTYCZNY atak jak w Etapie 2
///         (te same alokacje: atakujacy 50k WGOV, uczciwy 100k ale APATYCZNY — nie
///         glosuje; kworum 1%, threshold 0), zmieniona jest tylko jedna zmienna:
///         egzekucja przechodzi przez TimelockController.
///
///         Teza Etapu 7: timelock NIE zatrzymuje ataku sam z siebie — on tworzy OKNO
///         OBRONNE po wygranym glosowaniu. Zatrzymuje go dopiero ktos, kto w tym oknie
///         zareaguje (u nas: agent-straznik z CANCELLER_ROLE). Stad cztery dowody:
///           1) atak nie moze byc wykonany natychmiast po Succeeded (koniec "drenazu
///              w jednej transakcji" z Etapu 2),
///           2) w oknie opoznienia agent anuluje operacje -> skarbiec nietkniety,
///           3) UCZCIWIE: bez anulowania atak wchodzi po uplywie minDelay — okno
///              trzeba wykorzystac, samo opoznienie to nie obrona,
///           4) legalne propozycje dzialaja normalnie (timelock nie psuje governance).
contract TimelockDefenseTest is Test {
    GovToken internal token;
    TimelockController internal timelock;
    DAOGovernorTimelocked internal gov;
    Treasury internal treasury;
    MockERC20 internal asset;

    address internal attacker = makeAddr("attacker");
    address internal honest = makeAddr("honest"); // apatyczny — ma glosy, nie glosuje
    address internal agent = makeAddr("agent"); // straznik z CANCELLER_ROLE
    address internal recipient = makeAddr("recipient"); // odbiorca legalnej wyplaty

    uint256 internal constant SUPPLY = 1_000_000e18;
    uint256 internal constant ATTACKER_ALLOC = 50_000e18;
    uint256 internal constant HONEST_ALLOC = 100_000e18;
    uint256 internal constant TREASURY_FUNDS = 1_000_000e6; // 1 mln mUSD

    uint48 internal constant VOTING_DELAY = 60; // jak wariant realistyczny z Etapu 2
    uint32 internal constant VOTING_PERIOD = 3600;
    uint256 internal constant QUORUM_PCT = 1; // celowo wciaz 1%
    uint256 internal constant MIN_DELAY = 1 days; // okno obronne timelocka

    function setUp() public {
        vm.warp(1_800_000_000); // realny punkt startu zegara (checkpointy timestamp)

        token = new GovToken(address(this), SUPPLY);

        // Timelock: na starcie bez proposerow, egzekucja otwarta (address(0)),
        // admin = deployer TYLKO na czas okablowania rol (potem zrzeczenie).
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = new TimelockController(MIN_DELAY, proposers, executors, address(this));

        gov = new DAOGovernorTimelocked(
            IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT
        );

        // Okablowanie rol: Governor kolejkuje wygrane propozycje, agent moze anulowac
        // w oknie obronnym. Na koncu deployer zrzeka sie admina — timelock zostaje
        // samorzadny (adminem jest tylko on sam, zmiany rol tylko przez governance).
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(gov));
        timelock.grantRole(timelock.CANCELLER_ROLE(), agent);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        // KLUCZOWA zmiana wzgledem wariantu podatnego: skarbiec nalezy do TIMELOCKA
        // (to on wykonuje transakcje propozycji), nie do Governora.
        treasury = new Treasury(address(timelock));
        asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        // Dystrybucja jak w Etapie 2: atakujacy 50k, uczciwy 100k.
        token.transfer(attacker, ATTACKER_ALLOC);
        token.transfer(honest, HONEST_ALLOC);
    }

    // --- Okablowanie ---

    function test_WiringRolesAndOwnership() public view {
        assertEq(treasury.owner(), address(timelock), "owner skarbca musi byc timelock");
        assertEq(gov.timelock(), address(timelock));
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), address(gov)));
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), agent));
        // deployer nie ma juz zadnej wladzy nad timelockiem
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)));
        assertEq(timelock.getMinDelay(), MIN_DELAY);
        assertTrue(gov.proposalNeedsQueuing(0), "kazda propozycja musi isc przez kolejke");
    }

    // --- Dowod 1: koniec drenazu w jednej transakcji ---

    function test_Attack_CannotExecuteImmediatelyAfterSucceeded() public {
        (uint256 proposalId,,,, bytes32 descHash) = _runAttackVote();
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));

        // W Etapie 2 ten sam moment = natychmiastowy drenaz. Teraz: operacja nie jest
        // w kolejce timelocka, wiec executeBatch rewertuje.
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS, "skarbiec musi byc caly");
    }

    // --- Dowod 2 (sedno Etapu 7): agent anuluje w oknie obronnym ---

    function test_Attack_CanceledByAgentInDefenseWindow() public {
        (uint256 proposalId,,,, bytes32 descHash) = _runAttackVote();
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();

        // Atakujacy kolejkuje swoja wygrana propozycje (queue jest permissionless).
        vm.prank(attacker);
        gov.queue(t, v, c, descHash);
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Queued));

        // Proba wykonania PRZED uplywem minDelay — timelock odmawia (operacja nie Ready).
        vm.warp(block.timestamp + MIN_DELAY - 1);
        vm.prank(attacker);
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        // AGENT dziala w oknie obronnym: liczy id operacji tak jak Governor
        // (salt = bytes20(adres governora) XOR descriptionHash) i anuluje na timelocku.
        bytes32 salt = bytes20(address(gov)) ^ descHash;
        bytes32 operationId = timelock.hashOperationBatch(t, v, c, 0, salt);
        assertTrue(timelock.isOperationPending(operationId), "operacja powinna czekac w kolejce");

        vm.prank(agent);
        timelock.cancel(operationId);

        // Governor widzi anulowanie na timelocku i raportuje Canceled.
        assertEq(
            uint8(gov.state(proposalId)),
            uint8(IGovernor.ProposalState.Canceled),
            "po anulowaniu przez agenta stan musi byc Canceled"
        );

        // Nawet po uplywie pelnego minDelay atak jest martwy.
        vm.warp(block.timestamp + 2);
        vm.prank(attacker);
        vm.expectRevert();
        gov.execute(t, v, c, descHash);

        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS, "skarbiec nietkniety");
        assertEq(asset.balanceOf(attacker), 0, "atakujacy nie dostal nic");
    }

    // --- Dowod 3 (uczciwosc): samo opoznienie to NIE obrona ---

    function test_Attack_WithoutCancellation_LandsAfterDelay() public {
        (,,,, bytes32 descHash) = _runAttackVote();
        (address[] memory t, uint256[] memory v, bytes[] memory c,,) = _attackProposal();

        vm.prank(attacker);
        gov.queue(t, v, c, descHash);

        // Nikt nie reaguje w oknie obronnym...
        vm.warp(block.timestamp + MIN_DELAY + 1);
        vm.prank(attacker);
        gov.execute(t, v, c, descHash);

        // ...wiec atak ostatecznie wchodzi. To wlasnie dlatego timelock i agent sa
        // KOMPLEMENTARNE: timelock kupuje czas, agent ten czas wykorzystuje.
        assertEq(treasury.balanceOf(address(asset)), 0);
        assertEq(asset.balanceOf(attacker), TREASURY_FUNDS);
    }

    // --- Dowod 4: legalne governance dziala normalnie ---

    function test_LegitProposal_ExecutesAfterDelay() public {
        uint256 payout = 100_000e6;

        vm.prank(honest);
        token.delegate(honest);
        vm.warp(block.timestamp + 1);

        (address[] memory t, uint256[] memory v, bytes[] memory c) =
            _withdrawCall(recipient, payout);
        string memory description = "Wyplata operacyjna: grant 100k mUSD";
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

        assertEq(asset.balanceOf(recipient), payout, "odbiorca musi dostac wyplate");
        assertEq(treasury.balanceOf(address(asset)), TREASURY_FUNDS - payout);
        assertEq(uint8(gov.state(proposalId)), uint8(IGovernor.ProposalState.Executed));
    }

    // --- Pomocnicze: identyczny scenariusz ataku jak w Etapie 2 ---

    /// @dev Propozycja ataku: wyplata CALEGO skarbca na adres atakujacego.
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
        // Ta sama socjotechnika co WGIP-1: narracja "grant operacyjny" maskuje drenaz.
        description = "WGIP-T1: Grant operacyjny na rozwoj ekosystemu";
        descHash = keccak256(bytes(description));
    }

    /// @dev Przeprowadza atak do konca glosowania: delegacja -> propose -> glos For
    ///      (uczciwy holder APATYCZNY — nie glosuje) -> warp za deadline (Succeeded).
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
        gov.castVote(proposalId, 1); // For — 50k > kworum 10k, nikt nie oponuje

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
