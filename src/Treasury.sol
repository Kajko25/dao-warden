// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Treasury — the DAO vault
/// @notice Holds assets (ERC20). ONLY the owner, which is the Governor contract, can
///         withdraw. In the vulnerable version (Stages 1/2) there is no timelock, so as
///         soon as a proposal passes the vote the Governor can immediately execute
///         `withdraw` — no defense window. This is the essence of the BONK vulnerability
///         class: a legitimate mechanism + zero delay = a drain in a single transaction.
/// @dev    We set the owner to the Governor's address. During proposal execution
///         `msg.sender` is the Governor's address, so `onlyOwner` passes.
contract Treasury is Ownable {
    using SafeERC20 for IERC20;

    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    /// @param governor the Governor contract's address — the only entity allowed to withdraw
    constructor(address governor) Ownable(governor) {}

    /// @notice Withdraws `amount` of `token` to address `to`. Owner (Governor) only.
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    /// @notice The balance of a given token held in the vault (helper for tests/the agent).
    function balanceOf(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
