// TODO (maybe):
// - there should be a minimum amount of total ETH rewards that can be claimed. If lower than that, no one can claim in that period.

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Staking contract with periodic ETH rewards
/// @author Tempe Techie
/** 
@notice 
This contract issues a receipt token for any staked token (asset) in 1:1 ratio.
Receipt token holders can claim ETH rewards periodically.
The contract tries to follow the ERC-4626 standard with function names, but is not fully ERC-4626 compatible.
*/
contract PeriodicEthRewards is ERC20, Ownable {
  address public asset; // staked token address
  
  uint256 public claimRewardsTotal; // total ETH rewards that can be claimed for the previous period
  uint256 public claimRewardsMinimum; // if the minimum is not reached, no one can claim and all ETH rewards roll over into the next period

  uint256 public futureRewards; // ETH rewards that have not been claimed yet
  uint256 public lastClaimPeriod; // timestamp of the last claim period

  uint256 public maxUserDeposit = type(uint256).max; // maximum amount of tokens that can be deposited by a user (in wei)
  uint256 public minUserDeposit; // minimum amount of tokens that can be deposited by a user (in wei)

  uint256 immutable public periodLength; // length of the claim period (in seconds), the most common is 1 week (604800 seconds)

  mapping (address => uint256) public lastClaimed; // timestamp of the last claim for each user
  mapping (address => uint256) public lastDeposit; // timestamp of the last deposit for each user

  // CONSTRUCTOR
  constructor(
    address _asset,
    string memory _receiptTokenName,
    string memory _receiptTokenSymbol,
    uint256 _claimRewardsMinimum,
    uint256 _minUserDeposit,
    uint256 _periodLength
  ) ERC20(_receiptTokenName, _receiptTokenSymbol) {
    asset = _asset;
    claimRewardsMinimum = _claimRewardsMinimum;
    minUserDeposit = _minUserDeposit;
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

  /// @notice Returns the amount of time left (in seconds) until the user can withdraw their assets.
  function getLockedTimeLeft(address owner) public view returns (uint256) {
    if (lastDeposit[owner] == 0) {
      return 0;
    }

    uint256 timeLeft = lastDeposit[owner] + periodLength - block.timestamp;

    if (timeLeft > 0) {
      return timeLeft;
    }

    return 0;
  }

  function maxDeposit(address receiver) public view returns (uint256) {
    // you can customize it and return different values for different users
    return maxUserDeposit;
  }

  function maxWithdraw(address owner) public view returns (uint256) {
    return balanceOf(owner);
  }

  function minDeposit(address receiver) public view returns (uint256) {
    // you can customize it and return different values for different users
    return minUserDeposit;
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
  }

  function _claim(address claimer) internal returns (uint256 ethToClaim) {
    // if the claimer has not claimed yet, claim for them
    ethToClaim = previewClaim(claimer);

    if (ethToClaim > 0) {
      // send ETH to the claimer (use .call() to avoid reverts)
      (bool success, ) = payable(claimer).call{value: ethToClaim}("");
      require(success, "ETH transfer failed");

      // update lastClaimed
      lastClaimed[claimer] = block.timestamp;
    }

    _updateLastClaimPeriod();
  }

  function _updateLastClaimPeriod() internal {
    // only run if period length has passed
    if (block.timestamp > (lastClaimPeriod + periodLength)) {
      lastClaimPeriod = block.timestamp;

      // set total rewards to be claimed for the previous period
      if (address(this).balance >= claimRewardsMinimum) {
        // if the minimum is reached, claimRewardsTotal is set to the current balance
        claimRewardsTotal = address(this).balance;
      } else {
        claimRewardsTotal = 0; // if the minimum is not reached, no one can claim and all ETH rewards roll over into the next period
      } 

      futureRewards = 0; // reset future rewards to 0
    }
  }

  // RECEIVE (receive ETH)
  receive() external payable {
    // the line below must be before _updateLastClaimPeriod() because claimRewardsTotal is then set to current balance
    futureRewards += msg.value;

    _updateLastClaimPeriod();
  }

  // WRITE

  function claimRewards() public returns (uint256) {
    return _claim(_msgSender()); // returns the amount of ETH claimed
  }

  function claimRewardsFor(address claimer) public returns (uint256) {
    return _claim(claimer); // returns the amount of ETH claimed
  }

  function deposit(uint256 assets, address receiver) public returns (uint256 shares) {
    require(assets <= maxDeposit(receiver), "PeriodicEthRewards: deposit more than max");
    require(assets >= minUserDeposit, "PeriodicEthRewards: deposit less than min");

    lastDeposit[receiver] = block.timestamp; // after deposit withdrawals are disabled for periodLength

    ERC20(asset).transferFrom(_msgSender(), address(this), assets); // transfer staking tokens to this contract
    _mint(receiver, assets); // mint receipt tokens

    emit Deposit(_msgSender(), receiver, assets);

    return assets;
  }

  function withdraw(uint256 assets, address receiver, address owner) public returns (uint256 shares) {
    require(assets <= maxWithdraw(owner), "PeriodicEthRewards: withdraw more than max");
    require(block.timestamp > (lastDeposit[owner] + periodLength), "PeriodicEthRewards: assets are still locked");

    // if not full withdraw require balance to stay at least the min user deposit amount
    if (balanceOf(owner) > assets) {
      require((balanceOf(owner) - assets) >= minUserDeposit, "PeriodicEthRewards: the remained balance must be at least the min deposit amount");
    }

    if (_msgSender() != owner) {
      _spendAllowance(owner, _msgSender(), assets);
    }

    _burn(owner, assets); // burn receipt tokens
    ERC20(asset).transfer(receiver, assets); // receive back the asset tokens (staking tokens)

    // note: if user withdraws all staked tokens, they forfeit their claim for the current staking period (unless they deposit again)

    emit Withdraw(_msgSender(), receiver, owner, assets);

    return assets;
  }

  // OWNER

  /** 
  @notice 
  Sets the minimum amount of ETH that must be in the contract for rewards to be distributed.
  If minimum is not met, rewards roll over into the next period.
  */
  function setClaimRewardsMinimum(uint256 _claimRewardsMinimum) public onlyOwner {
    claimRewardsMinimum = _claimRewardsMinimum;
  }

  /// @notice Sets the maximum amount of assets that a user can deposit at once.
  function setMaxUserDeposit(uint256 _maxUserDeposit) public onlyOwner {
    maxUserDeposit = _maxUserDeposit;
  }

  /// @notice Sets the minimum amount of assets that a user can deposit.
  function setMinUserDeposit(uint256 _minUserDeposit) public onlyOwner {
    minUserDeposit = _minUserDeposit;
  }

}
