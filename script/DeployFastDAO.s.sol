// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @notice "Szybki" wariant DAO do iterowania Etapow 5-7: identyczna podatnosc jak
/// produkcyjny, ale votingDelay 5s + votingPeriod 30s -> pelny cykl ataku ~35s zamiast ~1h.
/// Realistyczny wariant (60s/3600s) zostaje na finalny pokaz dla komisji.
///
///   forge script script/DeployFastDAO.s.sol:DeployFastDAO --rpc-url arc --broadcast
contract DeployFastDAO is Script {
    uint256 constant SUPPLY = 1_000_000e18;
    uint48 constant VOTING_DELAY = 5; // 5 s
    uint32 constant VOTING_PERIOD = 30; // 30 s
    uint256 constant QUORUM_PCT = 1;

    uint256 constant ATTACKER_ALLOC = 50_000e18;
    uint256 constant HONEST_ALLOC = 100_000e18;
    uint256 constant TREASURY_FUNDS = 1_000_000e6;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address attacker = vm.envAddress("ATTACKER_ADDRESS");
        address honest = vm.envAddress("HONEST_VOTER_ADDRESS");

        vm.startBroadcast(deployerPk);

        GovToken token = new GovToken(deployer, SUPPLY);
        DAOGovernor gov =
            new DAOGovernor(IVotes(address(token)), VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT);
        Treasury treasury = new Treasury(address(gov));
        MockERC20 asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        token.transfer(attacker, ATTACKER_ALLOC);
        token.transfer(honest, HONEST_ALLOC);

        vm.stopBroadcast();

        console.log("=== DAO-WARDEN FAST variant on Arc Testnet ===");
        console.log("GovToken   :", address(token));
        console.log("DAOGovernor:", address(gov));
        console.log("Treasury   :", address(treasury));
        console.log("MockAsset  :", address(asset));
        console.log("votingDelay:", gov.votingDelay());
        console.log("votingPeriod:", gov.votingPeriod());
    }
}
