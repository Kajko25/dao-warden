// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernorTimelocked} from "../src/DAOGovernorTimelocked.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Etap 7 — deploy ZMITYGOWANEGO wariantu DAO (fast, do iteracji demo):
///         identyczna dystrybucja i parametry glosowania jak FAST DAO z Etapow 5-6,
///         jedyna zmiana architektoniczna = egzekucja przez TimelockController
///         (minDelay 120s = okno obronne agenta). Skarbiec nalezy do timelocka.
///
///         Cykl demo: propose -> 5s delay -> 30s glosowanie -> queue -> 120s okno
///         obronne (tu dziala agent: cancel) -> execute juz niemozliwe. ~3 min total.
///
///   forge script script/DeployTimelockedDAO.s.sol:DeployTimelockedDAO \
///     --rpc-url arc --broadcast
contract DeployTimelockedDAO is Script {
    uint256 constant SUPPLY = 1_000_000e18;
    uint48 constant VOTING_DELAY = 5; // 5 s (jak FAST DAO)
    uint32 constant VOTING_PERIOD = 30; // 30 s
    uint256 constant QUORUM_PCT = 1; // celowo wciaz 1% — mitygacja to SAM timelock
    uint256 constant MIN_DELAY = 120; // okno obronne timelocka (2 min)

    uint256 constant ATTACKER_ALLOC = 50_000e18;
    uint256 constant HONEST_ALLOC = 100_000e18;
    uint256 constant TREASURY_FUNDS = 1_000_000e6;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address attacker = vm.envAddress("ATTACKER_ADDRESS");
        address honest = vm.envAddress("HONEST_VOTER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");

        vm.startBroadcast(deployerPk);

        GovToken token = new GovToken(deployer, SUPPLY);

        // Timelock: bez proposerow na starcie, egzekucja otwarta (address(0)),
        // admin = deployer TYLKO na czas okablowania rol ponizej.
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock =
            new TimelockController(MIN_DELAY, proposers, executors, deployer);

        DAOGovernorTimelocked gov = new DAOGovernorTimelocked(
            IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT
        );

        // Okablowanie rol i zrzeczenie sie admina — timelock zostaje samorzadny.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(gov));
        timelock.grantRole(timelock.CANCELLER_ROLE(), agent);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        // KLUCZOWE: owner skarbca = TIMELOCK (on wykonuje propozycje), nie Governor.
        Treasury treasury = new Treasury(address(timelock));
        MockERC20 asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        token.transfer(attacker, ATTACKER_ALLOC);
        token.transfer(honest, HONEST_ALLOC);

        vm.stopBroadcast();

        console.log("=== DAO-WARDEN TIMELOCKED (fast) variant on Arc Testnet ===");
        console.log("GovToken          :", address(token));
        console.log("TimelockController:", address(timelock));
        console.log("DAOGovernor       :", address(gov));
        console.log("Treasury          :", address(treasury));
        console.log("MockAsset         :", address(asset));
        console.log("minDelay (s)      :", timelock.getMinDelay());
        console.log("agent = CANCELLER :", agent);
    }
}
