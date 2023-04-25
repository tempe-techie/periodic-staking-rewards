# Periodic Staking Rewards

> Still work-in-progress (WIP)

Staking smart contract vault that issues ETH or token rewards to stakers. Rewards are issued for a selected period (e.g. 1 week).

Two implementations:
- PeriodicEthRewards.sol (partially compatible with ERC-4626)
- ERC4626PeriodicEthRewards.sol (fully compatible with ERC-4626)

TODO:
- Name and Symbol dynamically set through constructor
- An minimum amount of ETH for rewards to be issued in the previous period
- Owner can remove ETH from the contract (debatable, although ownership can be renounced)
- Tests

## Use at your own risk

The contracts have not been audited. Use at your own risk.
