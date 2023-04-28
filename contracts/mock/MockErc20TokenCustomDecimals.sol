// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock token contract for testing purposes only
contract MockErc20TokenCustomDecimals is ERC20 {
  uint8 public immutable customDecimals;
  
  constructor(
    string memory _name, 
    string memory _symbol,
    uint8 _decimals
  ) ERC20(_name, _symbol) {
    customDecimals = _decimals;
    mint(msg.sender, 1_000_000 ether); // 1M mock tokens to deployer
  }

  function decimals() public view override returns (uint8) {
    return customDecimals;
  }

  function mint(address receiver, uint amount) public {
    _mint(receiver, amount);
  }
}
