# Periodic Staking Rewards

> _The contracts have not been audited by a third party. Use at your own risk._

This is a staking smart contract vault that periodically issues ETH rewards to stakers.

ETH can be sent to the contract at any time without a specific schedule. This feature is useful for protocols that collect fees and want to distribute them to specific token holders. The staking contract can run indefinitely without an end date.

The smart contract deployer sets a reward period, which can be, for example, one week. During this time, rewards accrue for stakers. Once the period is over, stakers have one week to collect their rewards. If they do not, their reward is forfeited and rolled over into the next period. The claim period is always the same length as the reward accrual period.

Actions:
- Claim
- Deposit (& Lock & Claim)
- Withdraw (& Claim)

TODO:
- Self-auditing using Slither, Mythril, etc.
- Testnet deployment with frontend

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

## Audit tools

### Flatten the contracts

Most audit tools will require you to flatten the contracts. This means that all contracts that are defined under the imports will actually be imported into one .sol file, so all code is in one place.

First create a new folder called flattened:

```bash
mkdir flattened
```

To flatten a contract, run this command:

```bash
npx hardhat flatten PeriodicEthRewards.sol >> flattened/PeriodicEthRewards.sol
```

> Important: You will need to delete all SPDX lines except the very first one from the flattened contract. You may also need to change solidity versions for the contract to work well with Mythril, or to use flags to specify a different solidity version (check Mythril docs).

### Mythril

Use Docker:

```bash
sudo docker pull mythril/myth
```

Go to the `flattened` folder and run this command:

```bash
sudo docker run -v $(pwd):/tmp mythril/myth -v4 analyze /tmp/PeriodicEthRewards.sol --max-depth 10
```

Or, if you don't use Docker, use this command alone:

```bash
myth -v4 analyze flattened/PeriodicEthRewards.sol -t 4 --max-depth 10
```

Flags:

- `v4`: verbose
- `o`: output
- `a`: address onchain
- `l`: automatically retrieve dependencies
- `t`: number of transactions (default is 3)
- `max-depth`: maximum recursion depth

Docs: https://mythril-classic.readthedocs.io/en/master/security-analysis.html 

### Slither

Install Slither:

```bash
pip3 install slither-analyzer --user
```

Run it in the `flattened` folder:

```bash
slither .
```

Docs: https://github.com/crytic/slither

## Debugging

### Error: ENOENT: no such file or directory

Run `npx hardhat clean` and then `npx hardhat compile`.

## Other notes

### Tokens with less than 18 decimals

Tokens with less than 18 decimals seem to work without any issue as asset tokens, but it may still make more sense to only use tokens with 18 decimals as staking/asset tokens - just in case there's an edge case issue that hasn't been caught.

### Variation: Forever locked stake (idea)

> Note that this is not part of the staking smart contracts in this repository, it's just an idea.

An interesting variation of the existing smart contracts would be to disable withdrawals. This could be achieved by deleting the withdrawal function or to implement a `withdrawalsDisabled` variable that owner could turn on or off.

Where would that feature come useful? For example in cases where the staking token is an LP token. So effectively a liquidity could be locked forever while LPs would still receive staking rewards for the liquidity they provided. And they could still transfer or trade the "receipt" tokens.

## Use at your own risk

The contracts have not been audited by a third party. Use at your own risk.

If you're an auditor who'd like to audit contracts pro-bono, please reach out to me.

For responsible disclosures please reach out to me via Telegram on tempetechie or via email tempe . techie at proton mail . com.
