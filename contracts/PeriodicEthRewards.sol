// TODO (maybe):
// - there should be a minimum amount of total ETH rewards that can be claimed. If lower than that, no one can claim in that period.

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Staking contract with periodic ETH rewards
/// @author Tempe Techie
/// @notice This contract issues a receipt token for any staked token (asset) in 1:1 ratio.
/// @notice Receipt token holders can claim ETH rewards periodically.
/// @notice The contract tries to follow the ERC-4626 standard with function names, but is not fully ERC-4626 compatible.
contract PeriodicEthRewards is ERC20, Ownable {
  address public asset; // staked token address
  
  uint256 public claimRewardsTotal; // total ETH rewards that can be claimed for the previous period
  uint256 public futureRewards; // ETH rewards that have not been claimed yet
  uint256 public lastClaimPeriod; // timestamp of the last claim period
  uint256 public maxUserDeposit = type(uint256).max; // maximum amount of tokens that can be deposited by a user
  uint256 public maxUserMint = type(uint256).max; // maximum amount of tokens that can be deposited by a user

  uint256 immutable public periodLength; // length of the claim period (in seconds), the most common is 1 week (604800 seconds)

  mapping (address => uint256) public lastClaimed; // timestamp of the last claim for each user

  // CONSTRUCTOR
  constructor(
    address _asset,
    uint256 _periodLength,
    string memory _receiptTokenName,
    string memory _receiptTokenSymbol
  ) ERC20(_receiptTokenName, _receiptTokenSymbol) {
    asset = _asset;
    periodLength = _periodLength;
    lastClaimPeriod = block.timestamp;
  }

  // EVENTS

  event Deposit(address indexed caller, address indexed owner, uint256 assets);

  event Withdraw(
      address indexed caller,
      address indexed receiver,
      address indexed owner,
      uint256 assets
  );

  // READ

  function maxDeposit(address receiver) public view returns (uint256) {
    // you can customize it and return different values for different users
    return maxUserDeposit;
  }

  function maxWithdraw(address owner) public view returns (uint256) {
    return balanceOf(owner);
  }

  function previewClaim(address claimer) public view returns (uint256) {
    if (lastClaimed[claimer] < lastClaimPeriod) {
      return claimRewardsTotal * balanceOf(claimer) / totalSupply(); // get ETH claim for a given user
    }

    return 0;
  }

  // INTERNAL

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual override {
    if (from != address(0)) {
      _claim(from);
    }

    if (to != address(0)) {
      _claim(to);
    }

    _updateLastClaimPeriod();
  }

  function _claim(address claimer) internal {
    // if the claimer has not claimed yet, claim for them
    uint256 ethToClaim = previewClaim(claimer);

    if (ethToClaim > 0) {
      // send ETH to the claimer (use .call() to avoid reverts)
      (bool success, ) = payable(claimer).call{value: ethToClaim}("");
      require(success, "ETH transfer failed");

      // update lastClaimed
      lastClaimed[claimer] = block.timestamp;
    }
  }

  /**
    * @dev Deposit/mint common workflow.
    */
  function _deposit(
    address caller,
    address receiver,
    uint256 assets
  ) internal virtual {
    // If _asset is ERC777, `transferFrom` can trigger a reenterancy BEFORE the transfer happens through the
    // `tokensToSend` hook. On the other hand, the `tokenReceived` hook, that is triggered after the transfer,
    // calls the vault, which is assumed not malicious.
    //
    // Conclusion: we need to do the transfer before we mint so that any reentrancy would happen before the
    // assets are transfered and before the shares are minted, which is a valid state.
    // slither-disable-next-line reentrancy-no-eth
    ERC20(asset).transferFrom(caller, address(this), assets); // transfer staking tokens to this contract
    _mint(receiver, assets);

    emit Deposit(caller, receiver, assets);
  }

  function _updateLastClaimPeriod() internal {
    // only run if period length has passed
    if (block.timestamp > (lastClaimPeriod + periodLength)) {
      lastClaimPeriod = block.timestamp;

      claimRewardsTotal = address(this).balance; // total rewards to be claimed for the previous period

      futureRewards = 0; // reset future rewards to 0
    }
  }

  function _withdraw (
    address caller,
    address receiver,
    address owner,
    uint256 assets
  ) internal virtual {
    if (caller != owner) {
      _spendAllowance(owner, caller, assets);
    }

    _burn(owner, assets); // burn receipt tokens
    ERC20(asset).transfer(receiver, assets); // receive back the asset tokens (staking tokens)

    // note: if user withdraws all staked tokens, they forfeit their claim for the current staking period

    emit Withdraw(caller, receiver, owner, assets);
  }

  // RECEIVE (receive ETH)
  receive() external payable {
    // the line below must be before _updateLastClaimPeriod() because claimRewardsTotal is then set to current balance
    futureRewards += msg.value;

    _updateLastClaimPeriod();
  }

  // WRITE

  function deposit(uint256 assets, address receiver) public returns (uint256 shares) {
    require(assets <= maxDeposit(receiver), "PeriodicEthRewards: deposit more than max");

    _deposit(_msgSender(), receiver, assets);

    return assets;
  }

  function withdraw(uint256 assets, address receiver, address owner) public returns (uint256 shares) {
    require(assets <= maxWithdraw(owner), "PeriodicEthRewards: withdraw more than max");

    _withdraw(_msgSender(), receiver, owner, assets);

    return assets;
  }

  // OWNER

  function setMaxUserDeposit(uint256 _maxUserDeposit) public onlyOwner {
    // limit max deposit that user can make at once
    maxUserDeposit = _maxUserDeposit;
  }

  function setMaxUserMint(uint256 _maxUserMint) public onlyOwner {
    // limit max mint that user can make at once
    maxUserMint = _maxUserMint;
  }
}
