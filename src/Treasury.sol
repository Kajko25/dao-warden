// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Treasury — skarbiec DAO
/// @notice Trzyma aktywa (ERC20). Wyplacic moze WYLACZNIE wlasciciel, ktorym jest
///         kontrakt Governora. W wersji podatnej (Etap 1/2) nie ma timelocka, wiec
///         gdy tylko propozycja przejdzie glosowanie, Governor moze natychmiast
///         wykonac `withdraw` — brak okna obronnego. To jest sedno klasy podatnosci
///         BONK: legalny mechanizm + zero opoznienia = drenaz w jednej transakcji.
/// @dev    Wlascicielem (owner) ustawiamy adres Governora. Podczas wykonania
///         propozycji `msg.sender` to adres Governora, wiec `onlyOwner` przechodzi.
contract Treasury is Ownable {
    using SafeERC20 for IERC20;

    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    /// @param governor adres kontraktu Governora — jedyny uprawniony do wyplat
    constructor(address governor) Ownable(governor) {}

    /// @notice Wyplaca `amount` tokena `token` na adres `to`. Tylko owner (Governor).
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    /// @notice Saldo danego tokena trzymane w skarbcu (pomocnicze do testow/agenta).
    function balanceOf(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
