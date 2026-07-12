// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @notice Etap 2 — deploy podatnego DAO na Arc Testnet.
/// Kolejnosc: GovToken -> DAOGovernor(token) -> Treasury(governor) -> MockERC20 (aktywo).
/// Nastepnie dystrybucja WGOV do ról i zasilenie skarbca aktywem.
///
/// Uruchomienie (broadcast):
///   forge script script/DeployDAO.s.sol:DeployDAO --rpc-url arc --broadcast
contract DeployDAO is Script {
    // Parametry DAO (odtwarzaja podatnosc klasy BONK)
    uint256 constant SUPPLY = 1_000_000e18; // 1 mln WGOV
    uint48 constant VOTING_DELAY = 60; // 60 s (zegar = timestamp)
    uint32 constant VOTING_PERIOD = 3600; // 1 h
    uint256 constant QUORUM_PCT = 1; // 1 %

    // Dystrybucja: attacker sam przekracza kworum; honest ma 2x tyle, ale jest apatyczny
    uint256 constant ATTACKER_ALLOC = 50_000e18; // 5 %
    uint256 constant HONEST_ALLOC = 100_000e18; // 10 %

    uint256 constant TREASURY_FUNDS = 1_000_000e6; // 1 mln mUSD (6 decimals)

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address attacker = vm.envAddress("ATTACKER_ADDRESS");
        address honest = vm.envAddress("HONEST_VOTER_ADDRESS");

        vm.startBroadcast(deployerPk);

        // 1) Token glosujacy — caly supply trafia do deployera, potem rozdajemy.
        GovToken token = new GovToken(deployer, SUPPLY);

        // 2) Governor — kworum 1%, brak timelocka. Zegar dziedziczy z tokena (timestamp).
        DAOGovernor gov =
            new DAOGovernor(IVotes(address(token)), VOTING_DELAY, VOTING_PERIOD, QUORUM_PCT);

        // 3) Skarbiec — wlascicielem jest Governor (tylko on wyplaca).
        Treasury treasury = new Treasury(address(gov));

        // 4) Aktywo skarbca (pelna kontrola — wlasny MockERC20 zamiast realnego USDC).
        MockERC20 asset = new MockERC20("Mock USD", "mUSD", 6);
        asset.mint(address(treasury), TREASURY_FUNDS);

        // 5) Dystrybucja sily glosu do ról.
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
