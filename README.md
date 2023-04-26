# Periodic Staking Rewards

> Still work-in-progress (WIP)

Staking smart contract vault that issues ETH or token rewards to stakers. Rewards are issued for a selected period (e.g. 1 week).

The PeriodicEthRewards.sol is partially compatible with ERC-4626 (some of the important function headers are the same).

Actions:
- Claim
- Deposit & Lock & Claim
- Withdraw & Claim

TODO:
- futureClaim view function?
  - function that calculates the future claim for a given user based on futureRewards and user's balanceOf
  - the future claim is not exact, because it may change up or down depending on the futureRewards and other users' deposits/withdrawals
- reentrancy guard for the _claim function?
- Tests

## Potential issues

### Asset locking attack

- When assets are deposited cannot withdraw for another period of time (e.g. 1 week).
- Because anyone can deposit for anyone (ERC4626-compliant deposit function), this means user1 could prevent user2 from ever withdrawing again by just depositing the minimum amount of assets (minUserDeposit) everytime the user2 wants to initiate a withdrawal.
- This would require user1 to frontrun user2's withdrawals.
- It would incur costs to user1. But if minUserDeposit is set very low it could be cheap to do, at least for certain period of time.
- Solution: Probably to break the ERC4626 compliancy and allow msg senders to deposit only for themselves:

Proposed change of the `deposit` function:

```solidity
function deposit(uint256 assets, address receiver) external returns (uint256)
```

In that case would could also change the `withdraw` function and allow msg sender to withdraw only for themselves:

```solidity
function withdraw(uint256 assets) external returns (uint256)
```

## Use at your own risk

The contracts have not been audited. Use at your own risk.
