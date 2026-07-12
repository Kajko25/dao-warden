// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

/// @notice Stage 6 — deploys the ERC-8004 registries and registers the DAO-WARDEN agent.
/// Settlement order:
///   1) The DEPLOYER (Wallet B) deploys IdentityRegistry + ValidationRegistry(identity).
///   2) The AGENT (AGENT_PRIVATE_KEY) registers ITSELF -> becomes the owner of agentId,
///      so it can later file validationRequests for its own decisions.
///
///   forge script script/DeployERC8004.s.sol:DeployERC8004 --rpc-url arc --broadcast
contract DeployERC8004 is Script {
    // AgentCard (docs/agent-card.json) as a CIDv1 raw+sha256 — see docs/agent-card.cid.txt.
    string constant AGENT_URI = "ipfs://bafkreih3vn4ehc3ilgor6ces6cswjzwmcclapcy6nm34sijklnvlwfqnyu";

    // The guarded DAOGovernor (realistic variant, deployed.json) — for the "guards" metadata.
    address constant GUARDED_GOVERNOR = 0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        uint256 agentPk = vm.envUint("AGENT_PRIVATE_KEY");
        address agent = vm.addr(agentPk);
        address validator = vm.envAddress("VALIDATOR_ADDRESS");

        // --- 1) The deployer deploys the registries ---
        vm.startBroadcast(deployerPk);
        IdentityRegistry identity = new IdentityRegistry();
        ValidationRegistry validation = new ValidationRegistry(address(identity));
        vm.stopBroadcast();

        // --- 2) The agent registers itself (with metadata) ---
        IdentityRegistry.MetadataEntry[] memory md = new IdentityRegistry.MetadataEntry[](3);
        md[0] = IdentityRegistry.MetadataEntry("framework", bytes("dao-warden"));
        md[1] = IdentityRegistry.MetadataEntry("guards", abi.encodePacked(GUARDED_GOVERNOR));
        md[2] = IdentityRegistry.MetadataEntry("validator", abi.encodePacked(validator));

        vm.startBroadcast(agentPk);
        uint256 agentId = identity.register(AGENT_URI, md);
        vm.stopBroadcast();

        console.log("=== DAO-WARDEN ERC-8004 (Stage 6) on Arc Testnet ===");
        console.log("IdentityRegistry  :", address(identity));
        console.log("ValidationRegistry:", address(validation));
        console.log("agent (owner)     :", agent);
        console.log("agentId           :", agentId);
        console.log("agentURI          :", AGENT_URI);
        console.log("guards Governor   :", GUARDED_GOVERNOR);
        console.log("validator         :", validator);
    }
}
