// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernorTimelocked} from "../src/DAOGovernorTimelocked.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Stage 7 — deploys the MITIGATED DAO variant (fast, for iterating the demo):
///         the same distribution and voting parameters as the FAST DAO from Stages 5-6,
///         the only architectural change = execution through a TimelockController
///         (minDelay 120s = the agent's defense window). The treasury is owned by the timelock.
///
///         Demo cycle: propose -> 5s delay -> 30s voting -> queue -> 120s defense window
///         (this is where the agent acts: cancel) -> execute becomes impossible. ~3 min total.
///
///   forge script script/DeployTimelockedDAO.s.sol:DeployTimelockedDAO \
///     --rpc-url arc --broadcast
contract DeployTimelockedDAO is Script {
    uint256 constant SUPPLY = 1_000_000e18;
    uint48 constant VOTING_DELAY = 5; // 5 s (like FAST DAO)
    uint32 constant VOTING_PERIOD = 30; // 30 s
    uint256 constant QUORUM_PCT = 1; // deliberately still 1% — the mitigation is the timelock itself
    uint256 constant MIN_DELAY = 120; // the timelock defense window (2 min)

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

        // Timelock: no proposers at the start, execution open (address(0)),
        // admin = deployer ONLY for the duration of the role wiring below.
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock =
            new TimelockController(MIN_DELAY, proposers, executors, deployer);

        DAOGovernorTimelocked gov = new DAOGovernorTimelocked(
            IVotes(address(token)), timelock, VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT
        );

        // Wire the roles and renounce admin — the timelock becomes self-governed.
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(gov));
        timelock.grantRole(timelock.CANCELLER_ROLE(), agent);
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        // KEY: the treasury owner = the TIMELOCK (it executes proposals), not the Governor.
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
