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
- Tests

## Limitations

### Rebasing tokens are not supported

Tokens that intrinsically change balance (without tokens holders doing anything) such as stETH or AMPL are not supported as assets/staking tokens. Please avoid using them.

### No ERC4626 compatibility

At first the contract intended to be ERC-4626 compatible, but then it turned out that the deposit function would allow for an "asset locking attack". The ERC4626 `deposit` function allows depositing funds for any user (`receiver`): 

```solidity
function deposit(uint256 assets, address receiver) public returns (uint256)
```

Normally this would be fine, but in our case each deposit triggers a lock of funds for the default period of time, which means someone could prevent another user from withdrawing by depositing a minimum amount of funds in the victim's name.

That's why in this contract the message sender can only deposit or withdraw for themselves, not for anyone else:

```solidity
function deposit(uint256 assets) external returns (uint256)
```

## Use at your own risk

The contracts have not been audited. Use at your own risk.
