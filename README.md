# Periodic Staking Rewards

> Still work-in-progress (WIP)

This is a staking smart contract vault that periodically issues ETH rewards to stakers.

ETH can be sent to the contract at any time without a specific schedule. This feature is useful for protocols that collect fees and want to distribute them to specific token holders. The staking contract can run indefinitely without an end date.

The smart contract deployer sets a reward period, which can be, for example, one week. During this time, rewards accrue for stakers. Once the period is over, stakers have one week to collect their rewards. If they do not, their reward is forfeited and rolled over into the next period. The claim period is always the same length as the reward accrual period.

Actions:
- Claim
- Deposit (& Lock & Claim)
- Withdraw (& Claim)

TODO:
- mitigate an asset locking attack
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

## Limitations

### Rebasing tokens are not supported

Tokens that intrinsically change balance (without tokens holders doing anything) such as stETH or AMPL are not supported as assets/staking tokens. Please avoid using them.

## Use at your own risk

The contracts have not been audited. Use at your own risk.
