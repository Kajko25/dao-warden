// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {GovToken} from "../src/GovToken.sol";
import {DAOGovernor} from "../src/DAOGovernor.sol";
import {DAOGovernorTimelocked} from "../src/DAOGovernorTimelocked.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice Pomiar kosztu deploymentu (gas) kazdego kontraktu — do oszacowania
///         kosztu on-chain na Arc. Uruchom: forge test --match-test test_MeasureDeployGas -vv
contract DeployGasTest is Test {
    function test_MeasureDeployGas() public {
        vm.warp(1_800_000_000);

        uint256 g = gasleft();
        GovToken token = new GovToken(address(this), 1_000_000e18);
        console.log("GovToken   deploy gas:", g - gasleft());

        g = gasleft();
        DAOGovernor gov = new DAOGovernor(IVotes(address(token)), 60, 3600, 1);
        console.log("DAOGovernor deploy gas:", g - gasleft());

        g = gasleft();
        new Treasury(address(gov));
        console.log("Treasury    deploy gas:", g - gasleft());

        g = gasleft();
        new MockERC20("Mock USD", "mUSD", 6);
        console.log("MockERC20   deploy gas:", g - gasleft());
    }

    /// @notice Estymata dla Etapu 7 (wariant z timelockiem) — deploy + okablowanie rol.
    function test_MeasureTimelockedDeployGas() public {
        vm.warp(1_800_000_000);
        GovToken token = new GovToken(address(this), 1_000_000e18);

        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0);

        uint256 g = gasleft();
        TimelockController timelock =
            new TimelockController(1 days, proposers, executors, address(this));
        console.log("TimelockController     deploy gas:", g - gasleft());

        g = gasleft();
        DAOGovernorTimelocked gov =
            new DAOGovernorTimelocked(IVotes(address(token)), timelock, 60, 3600, 1);
        console.log("DAOGovernorTimelocked  deploy gas:", g - gasleft());

        g = gasleft();
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(gov));
        timelock.grantRole(timelock.CANCELLER_ROLE(), makeAddr("agent"));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));
        console.log("okablowanie rol (3 tx) razem gas :", g - gasleft());

        g = gasleft();
        new Treasury(address(timelock));
        console.log("Treasury               deploy gas:", g - gasleft());
    }
}
