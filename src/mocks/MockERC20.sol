// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — a stand-in treasury asset for local tests
/// @notice Represents a valuable asset held in the Treasury (e.g. a stablecoin). The
///         golden test mints it into the treasury, and the attacker tries to drain it.
///         On a real Arc deploy we swap it for testnet USDC (0x3600...0000, 6 decimals).
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
