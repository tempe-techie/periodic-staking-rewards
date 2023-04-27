// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17; // solhint-disable-line compiler-version

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title Staking contract with periodic ETH rewards
/// @author Tempe Techie
/** @notice The contract issues a receipt token for any staked token in 1:1 ratio. Receipt token holders can 
claim ETH rewards periodically. */
contract PeriodicEthRewards is ERC20, Ownable, ReentrancyGuard {
  address public immutable asset; // staked token address (rebase tokens are not supported)
  
  uint256 public claimRewardsTotal; // total ETH rewards that can be claimed for the previous period
  uint256 public claimRewardsMinimum; // if minimum not reached, no one can claim (all ETH rewards go to next period)

  uint256 public futureRewards; // ETH rewards that have not been claimed yet
  uint256 public lastClaimPeriod; // timestamp of the last claim period

  uint256 public maxDeposit = type(uint256).max; // maximum amount of tokens that can be deposited by a user (in wei)
  uint256 public minDeposit; // minimum amount of tokens that can be deposited by a user (in wei)

  uint256 public immutable periodLength; // length of the claim period (in seconds), the most common is 1 week (604800s)

  mapping (address => uint256) public lastClaimed; // timestamp of the last claim for each user
  mapping (address => uint256) public lastDeposit; // timestamp of the last deposit for each user

  // CONSTRUCTOR
  constructor(
    address _asset,
    string memory _receiptTokenName,
    string memory _receiptTokenSymbol,
    uint256 _claimRewardsMinimum,
    uint256 _minDeposit,
    uint256 _periodLength
  ) ERC20(_receiptTokenName, _receiptTokenSymbol) {
    asset = _asset;
    
    claimRewardsMinimum = _claimRewardsMinimum;
    minDeposit = _minDeposit;
    periodLength = _periodLength;

    lastClaimPeriod = block.timestamp;
  }

  // EVENTS

  event Deposit(address indexed owner, uint256 assets);
  event Withdraw(address indexed owner, uint256 assets);

  // READ

  /// @notice Returns the amount of time left (in seconds) until the user can withdraw their assets.
  function getLockedTimeLeft(address _owner) external view returns (uint256) {
    if (lastDeposit[_owner] == 0) {
      return 0;
    }

    uint256 timeLeft = lastDeposit[_owner] + periodLength - block.timestamp;

    if (timeLeft > 0) {
      return timeLeft;
    }

    return 0;
  }

  /// @notice Returns the amount of ETH that can be claimed for a given user
  function previewClaim(address _claimer) public view returns (uint256) {
    if (lastClaimed[_claimer] < lastClaimPeriod && totalSupply() > 0) {
      return claimRewardsTotal * balanceOf(_claimer) / totalSupply(); // get ETH claim for a given user
    }

    return 0;
  }

  /** @notice Returns the amount of ETH that may be claimed for a given user in the next claim period. The amount can 
  change up or down until the current period is over. */
  function previewFutureClaim(address _claimer) external view returns (uint256) {
    if (totalSupply() > 0) {
      return futureRewards * balanceOf(_claimer) / totalSupply(); // get future ETH claim for a given user
    }

    return 0;
  }

  // INTERNAL

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 // amount commented out because it is not used
  ) internal virtual override {
    if (from != address(0)) {
      _claim(from);
    }

    if (to != address(0)) {
      _claim(to);
      // in case the receiver had no previous claims, set lastClaimed to the current timestamp
      // this prevents double claiming of rewards, because the sender should have gotten all 
      // the rewards from the current claim period
      lastClaimed[to] = block.timestamp;
    }
  }

  function _claim(address _claimer) internal returns (uint256 ethToClaim) {
    // check if claimer has any ETH (left) to claim
    ethToClaim = previewClaim(_claimer);

    if (ethToClaim > 0) {
      // update lastClaimed
      lastClaimed[_claimer] = block.timestamp;

      // send ETH to the claimer
      (bool success, ) = payable(_claimer).call{value: ethToClaim}("");
      require(success, "ETH transfer failed");
    }

    _updateLastClaimPeriod();
  }

  function _updateLastClaimPeriod() internal {
    // only run if the current period has ended (start a new period)
    if (block.timestamp > (lastClaimPeriod + periodLength)) {
      lastClaimPeriod = block.timestamp;

      // set total rewards to be claimed for the previous period
      if (address(this).balance >= claimRewardsMinimum) {
        // if the minimum is reached, claimRewardsTotal is set to the current balance
        claimRewardsTotal = address(this).balance;
        futureRewards = 0; // reset future rewards to 0
      } else {
        claimRewardsTotal = 0; // if minimum not reached, no one can claim. All ETH rewards go into the next period
        futureRewards = address(this).balance; // set future rewards to the current balance
      } 
    }
  }

  // RECEIVE (receive ETH)
  receive() external payable {
    // futureRewards update must happen before _updateLastClaimPeriod() 
    // because claimRewardsTotal is then set to current balance
    futureRewards += msg.value;

    _updateLastClaimPeriod();
  }

  // WRITE

  /// @notice Claim ETH rewards for yourself.
  function claimRewards() external nonReentrant returns (uint256) {
    return _claim(_msgSender()); // returns the amount of ETH claimed
  }

  /// @notice Claim ETH rewards for someone else.
  function claimRewardsFor(address _claimer) external nonReentrant returns (uint256) {
    return _claim(_claimer); // returns the amount of ETH claimed
  }

  /// @notice Deposit assets and mint receipt tokens.
  function deposit(uint256 assets) external nonReentrant returns (uint256) {
    require(assets <= maxDeposit, "PeriodicEthRewards: deposit is more than max");
    require(assets >= minDeposit, "PeriodicEthRewards: deposit is less than min");

    lastDeposit[_msgSender()] = block.timestamp; // after deposit withdrawals are disabled for periodLength

    ERC20(asset).transferFrom(_msgSender(), address(this), assets); // transfer staking tokens to this contract
    _mint(_msgSender(), assets); // mint receipt tokens

    emit Deposit(_msgSender(), assets);

    return assets;
  }

  /// @notice Manually update the last claim period (if needed). Anyone can call this function.
  function updateLastClaimPeriod() external {
    _updateLastClaimPeriod();
  }

  /// @notice Withdraw assets and burn receipt tokens.
  function withdraw(uint256 assets) external nonReentrant returns (uint256) {
    require(assets > 0, "PeriodicEthRewards: cannot withdraw 0");
    require(assets <= balanceOf(_msgSender()), "PeriodicEthRewards: cannot withdraw more than balance");
    require(block.timestamp > (lastDeposit[_msgSender()] + periodLength), "PeriodicEthRewards: assets are still locked");

    // if not full withdraw, require balance to stay at least the min user deposit amount
    if (balanceOf(_msgSender()) > assets) {
      require(
        (balanceOf(_msgSender()) - assets) >= minDeposit, 
        "PeriodicEthRewards: the remaining balance too low"
      );
    }

    _burn(_msgSender(), assets); // burn receipt tokens
    ERC20(asset).transfer(_msgSender(), assets); // receive back the asset tokens (staking tokens)

    // note: if user withdraws all staked tokens, they forfeit their claim for the current 
    // staking period (unless they deposit again)

    emit Withdraw(_msgSender(), assets);

    return assets;
  }

  // OWNER

  /// @notice Recover any ERC-20 token mistakenly sent to this contract address (except the staking and receipt tokens)
  function recoverERC20(address tokenAddress_, uint256 tokenAmount_, address recipient_) external onlyOwner {
    require(tokenAddress_ != asset, "PeriodicEthRewards: cannot recover staking token");
    require(tokenAddress_ != address(this), "PeriodicEthRewards: cannot recover receipt token");

    ERC20(tokenAddress_).transfer(recipient_, tokenAmount_);
  }

  /// @notice Recover any ERC-721 token mistakenly sent to this contract address
  function recoverERC721(address tokenAddress_, uint256 tokenId_, address recipient_) external onlyOwner {
    IERC721(tokenAddress_).transferFrom(address(this), recipient_, tokenId_);
  }

  /// @notice Recover any ERC-1155 token mistakenly sent to this contract address
  function recoverERC1155(
    address tokenAddress_, 
    uint256 tokenId_, 
    address recipient_, 
    uint256 _amount
  ) external onlyOwner {
    IERC1155(tokenAddress_).safeTransferFrom(address(this), recipient_, tokenId_, _amount, "");
  }

  /** @notice Recover ETH from contract. This is contentious so it is commented out by default. 
  Uncomment only if you really need it. */
  /*
  function recoverETH(address recipient_, uint256 _amount) external onlyOwner {
    (bool success, ) = payable(recipient_).call{value: _amount}("");
    require(success, "Failed to withdraw ETH from contract");
  }
  */

  /** 
  @notice 
  Sets the minimum amount of ETH that must be in the contract for rewards to be distributed.
  If minimum is not met, rewards roll over into the next period.
  */
  function setClaimRewardsMinimum(uint256 _claimRewardsMinimum) external onlyOwner {
    claimRewardsMinimum = _claimRewardsMinimum;
  }

  /// @notice Sets the maximum amount of assets that a user can deposit at once.
  function setMaxDeposit(uint256 _maxDeposit) external onlyOwner {
    maxDeposit = _maxDeposit;
  }

  /// @notice Sets the minimum amount of assets that a user can deposit.
  function setMinDeposit(uint256 _minDeposit) external onlyOwner {
    minDeposit = _minDeposit;
  }

}
