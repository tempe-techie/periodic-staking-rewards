# Periodic Staking Rewards

> Still work-in-progress (WIP)

Staking smart contract vault that issues ETH or token rewards to stakers. Rewards are issued for a selected period (e.g. 1 week).

Two implementations:
- PeriodicEthRewards.sol (partially compatible with ERC-4626)
- ERC4626PeriodicEthRewards.sol (fully compatible with ERC-4626)

Actions:
- Claim
- Deposit & Lock & Claim
- Withdraw & Claim

TODO:
- An minimum amount of ETH for rewards to be issued in the previous period
- A minimum amount of assets to stake?
- Owner can remove ETH from the contract (debatable, although ownership can be renounced)
- Tests

## Tests

Scenarios:
- There's a very small amount of ETH in the contract to claim for the previous period (like just a few wei or even just 1 wei). What happens if there are multiple stakers with different staked amounts? What happens if minUserDeposit and claimRewardsMinimum are set too low (1 wei or even 0)?
- User tries to claim for another user. Should be possible, but the asset owner should always receive the rewards, no one else.
- User makes a huge deposit right before the previous claim period ends. And then makes the claim right after the new claim period starts. And then tries to withdraw assets. (Should not be possible because of the staking lock which lasts as long as one period)

## Use at your own risk

The contracts have not been audited. Use at your own risk.
