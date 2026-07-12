// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @notice Stage 2 — deploy the vulnerable DAO on Arc Testnet.
/// Order: GovToken -> DAOGovernor(token) -> Treasury(governor) -> MockERC20 (asset).
/// Then distribute WGOV to the roles and fund the treasury with the asset.
///
/// Run (broadcast):
///   forge script script/DeployDAO.s.sol:DeployDAO --rpc-url arc --broadcast
contract DeployDAO is Script {
    // DAO parameters (reproduce the BONK vulnerability class)
    uint256 constant SUPPLY = 1_000_000e18; // 1M WGOV
    uint48 constant VOTING_DELAY = 60; // 60 s (clock = timestamp)
    uint32 constant VOTING_PERIOD = 3600; // 1 h
    uint256 constant QUORUM_PCT = 1; // 1 %

    // Distribution: the attacker alone clears quorum; the honest holder has 2x as much but is apathetic
    uint256 constant ATTACKER_ALLOC = 50_000e18; // 5 %
    uint256 constant HONEST_ALLOC = 100_000e18; // 10 %

    uint256 constant TREASURY_FUNDS = 1_000_000e6; // 1M mUSD (6 decimals)

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address attacker = vm.envAddress("ATTACKER_ADDRESS");
        address honest = vm.envAddress("HONEST_VOTER_ADDRESS");

        vm.startBroadcast(deployerPk);

        // 1) Voting token — the whole supply goes to the deployer, then we hand it out.
        GovToken token = new GovToken(deployer, SUPPLY);

        // 2) Governor — 1% quorum, no timelock. The clock is inherited from the token (timestamp).
        DAOGovernor gov =
            new DAOGovernor(IVotes(address(token)), VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT);

        // 3) Treasury — the owner is the Governor (only it can withdraw).
        Treasury treasury = new Treasury(address(gov));

        // 4) Treasury asset (full control — our own MockERC20 instead of real USDC).
        MockERC20 asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        // 5) Distribute voting power to the roles.
        token.transfer(attacker, ATTACKER_ALLOC);
        token.transfer(honest, HONEST_ALLOC);

        vm.stopBroadcast();

        console.log("=== DAO-WARDEN deployed on Arc Testnet ===");
        console.log("GovToken   :", address(token));
        console.log("DAOGovernor:", address(gov));
        console.log("Treasury   :", address(treasury));
        console.log("MockAsset  :", address(asset));
        console.log("--- distribution ---");
        console.log("deployer float WGOV:", token.balanceOf(deployer));
        console.log("attacker WGOV      :", token.balanceOf(attacker));
        console.log("honest   WGOV      :", token.balanceOf(honest));
        console.log("treasury mUSD      :", asset.balanceOf(address(treasury)));
    }
}
