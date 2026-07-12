// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title GovToken — the DAO voting token (ERC20Votes)
/// @notice The token grants voting power. ERC20Votes stores "checkpoints": snapshots
///         (timepoint => an address's voting power). When a proposal is created the
///         Governor snapshots a specific timepoint, and everyone votes with the power
///         from that snapshot, not the current one — so buying tokens AFTER the snapshot
///         does not affect an ongoing proposal (but it affects the next one — that is how
///         the BONK attack worked).
/// @dev    NOTE on checkpoints: voting power does not update automatically on transfer.
///         An address must first call `delegate(...)` (even to itself) for its balance to
///         count as votes at all.
contract GovToken is ERC20, ERC20Permit, ERC20Votes {
    /// @param initialHolder the address that receives the entire initial supply
    /// @param initialSupply the total supply (in base units, 18 decimals)
    constructor(address initialHolder, uint256 initialSupply)
        ERC20("DAO Warden Gov Token", "WGOV")
        ERC20Permit("DAO Warden Gov Token")
    {
        _mint(initialHolder, initialSupply);
    }

    // --- Clock: TIMESTAMP mode instead of the default block number ---
    // On Arc a block lasts ~0.5s, so counting periods in blocks is awkward and depends
    // on the variable block time. A timestamp gives periods in seconds.
    // The token and the Governor MUST share the same clock — the Governor (GovernorVotes)
    // reads token().clock(), so overriding it here is enough.

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // --- Overrides required by the inheritance diamond (ERC20 + Permit + Votes) ---
    // Both parents define _update / nonces; Solidity requires explicit resolution.

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
