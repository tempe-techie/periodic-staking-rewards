# Periodic Staking Rewards

> Still work-in-progress (WIP)

Staking smart contract vault that issues ETH or token rewards to stakers. Rewards are issued for a selected period (e.g. 1 week).

The PeriodicEthRewards.sol is partially compatible with ERC-4626 (some of the important function headers are the same).

Actions:
- Claim
- Deposit & Lock & Claim
- Withdraw & Claim

TODO:
- Tests

## Tests

Scenarios:
- There's a very small amount of ETH in the contract to claim for the previous period (like just a few wei or even just 1 wei). What happens if there are multiple stakers with different staked amounts? What happens if minUserDeposit and claimRewardsMinimum are set too low (1 wei or even 0)?
- User tries to claim for another user. Should be possible, but the asset owner should always receive the rewards, no one else.
- User makes a huge deposit right before the previous claim period ends. And then makes the claim right after the new claim period starts. And then tries to withdraw assets. (Should not be possible because of the staking lock which lasts as long as one period)
- User sends receipt tokens to another address before claiming
- User sends receipt tokens to another address after claiming

## Use at your own risk

The contracts have not been audited. Use at your own risk.
