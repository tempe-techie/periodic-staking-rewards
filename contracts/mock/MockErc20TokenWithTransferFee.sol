// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock token contract for testing purposes only
contract MockErc20TokenWithTransferFee is ERC20 {
  address public owner;
  
  constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
    owner = msg.sender;
    mint(msg.sender, 1_000_000 ether); // 1M mock tokens to deployer
  }

  function mint(address receiver, uint amount) public {
    _mint(receiver, amount);
  }

  function transfer(address to, uint256 amount) public override returns (bool) {
    uint256 fee = amount / 100; // 1% fee burned
    
    _transfer(_msgSender(), owner, fee); // send fee to owner
    _transfer(_msgSender(), to, amount - fee);

    return true;
  }

  function transferFrom(
    address from,
    address to,
    uint256 amount
  ) public virtual override returns (bool) {
    address spender = _msgSender();
    _spendAllowance(from, spender, amount);

    uint256 fee = amount / 100; // 1% fee burned
    _transfer(from, owner, fee); // send fee to owner
    _transfer(from, to, amount - fee);

    return true;
  }
}
