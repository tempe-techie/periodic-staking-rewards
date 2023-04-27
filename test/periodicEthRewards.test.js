// npx hardhat test test/periodicEthRewards.test.js

const { expect } = require("chai");

function calculateGasCosts(testName, receipt) {
  console.log(testName + " gasUsed: " + receipt.gasUsed);

  // coin prices in USD
  const matic = 1;
  const eth = 1800;
  
  const gasCostMatic = ethers.utils.formatUnits(String(Number(ethers.utils.parseUnits("500", "gwei")) * Number(receipt.gasUsed)), "ether");
  const gasCostEthereum = ethers.utils.formatUnits(String(Number(ethers.utils.parseUnits("50", "gwei")) * Number(receipt.gasUsed)), "ether");
  const gasCostArbitrum = ethers.utils.formatUnits(String(Number(ethers.utils.parseUnits("1.25", "gwei")) * Number(receipt.gasUsed)), "ether");

  console.log(testName + " gas cost (Ethereum): $" + String(Number(gasCostEthereum)*eth));
  console.log(testName + " gas cost (Arbitrum): $" + String(Number(gasCostArbitrum)*eth));
  console.log(testName + " gas cost (Polygon): $" + String(Number(gasCostMatic)*matic));
}

describe("PeriodicEthRewards", function () {
  let rewardsContract;
  let stakingTokenContract;

  let owner;
  let user1;
  let user2;
  let user3;

  const user1stakingTokenBalance = ethers.utils.parseEther("850");
  const user2stakingTokenBalance = ethers.utils.parseEther("1500");

  const claimRewardsMinimum = ethers.utils.parseEther("1");
  const minUserDeposit = ethers.utils.parseEther("0.0001");
  const claimPeriod = 604800; // 1 week

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MockErc20Token = await ethers.getContractFactory("MockErc20Token");
    stakingTokenContract = await MockErc20Token.deploy("Staking Token", "STK");
    await stakingTokenContract.deployed();

    const PeriodicEthRewards = await ethers.getContractFactory("PeriodicEthRewards");
    rewardsContract = await PeriodicEthRewards.deploy(
      stakingTokenContract.address,
      "Receipt Token",
      "RCP",
      claimRewardsMinimum, // 1 ETH as minimum rewards total per period
      minUserDeposit, // 0.0001 ETH as minimum user deposit
      claimPeriod // 1 week claim period
    );
    await rewardsContract.deployed();

    // mint staking tokens for user1 and user2
    await stakingTokenContract.mint(user1.address, user1stakingTokenBalance); // 850 tokens
    await stakingTokenContract.mint(user2.address, user2stakingTokenBalance); // 1500 tokens
  });

  // scenario 1: user1 deposits 300 tokens, user2 deposits 700 tokens
  // user1 should get 30% of the rewards and user2 should get 70% of the rewards after 1 week
  it("Scenario 1: User1 deposits 300 tokens, user2 deposits 700 tokens. They claim rewards after 1 week.", async function () {
    const user1tokensToDeposit = ethers.utils.parseEther("300");
    const user2tokensToDeposit = ethers.utils.parseEther("700");

    // check user1 and user2 staking token balance
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    // user1 deposits 100 tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user2 deposits 200 tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit);

    // user1 should have 0 rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(0);

    // user2 should have 0 rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0);

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);

    // send 9 ETH to the rewards contract
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("9"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("9"));

    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");

    // send 1 more ETH to the rewards contract to trigger _updateLastClaimPeriod
    // this ETH will be added to the rewards pool for the previous claim period, so 10 ETH in total (9 ETH + 1 ETH)
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("1"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("10"));

    // user1 can have 30% of the rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(ethers.utils.parseEther("3"));

    // user2 can have 70% of the rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(ethers.utils.parseEther("7"));

    // preview claim for user3 (should be 0)
    expect(await rewardsContract.connect(user3).previewClaim(user3.address)).to.equal(0);

    // user1 ETH balance before
    const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
    console.log("user1 ETH balance before: ", ethers.utils.formatEther(user1BalanceBefore));

    // owner claims rewards for user1 (so that no gas fees are paid by user1)
    await rewardsContract.claimRewardsFor(user1.address);

    // user1 ETH balance after
    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
    console.log("user1 ETH balance after: ", ethers.utils.formatEther(user1BalanceAfter));
    expect(user1BalanceAfter).to.equal(user1BalanceBefore.add(ethers.utils.parseEther("3")));

    // user2 ETH balance before
    const user2BalanceBefore = await ethers.provider.getBalance(user2.address);
    console.log("user2 ETH balance before: ", ethers.utils.formatEther(user2BalanceBefore));

    // user2 claims rewards for themselves
    const tx = await rewardsContract.connect(user2).claimRewards();
    const receipt = await tx.wait();
    calculateGasCosts("user claimRewards()", receipt);

    // user2 ETH balance after
    const user2BalanceAfter = await ethers.provider.getBalance(user2.address);
    console.log("user2 ETH balance after: ", ethers.utils.formatEther(user2BalanceAfter));
    // expect user2 balance before to be less than user2 balance after
    expect(user2BalanceBefore).to.be.lt(user2BalanceAfter);

    // check rewards contract balance (should be 0 ETH)
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);

    // user3 ETH balance before
    const user3BalanceBefore = await ethers.provider.getBalance(user3.address);
    console.log("user3 ETH balance before: ", ethers.utils.formatEther(user3BalanceBefore));

    // owner tries to claim rewards for user3 (should not fail, but should return 0 instead)
    await rewardsContract.claimRewardsFor(user3.address);

    // user3 ETH balance after (should be the same as before)
    const user3BalanceAfter = await ethers.provider.getBalance(user3.address);
    console.log("user3 ETH balance after: ", ethers.utils.formatEther(user3BalanceAfter));
    expect(user3BalanceAfter).to.equal(user3BalanceBefore);
  });

  // Scenario 2: there's a very small amount of ETH in the rewards contract (just 1 wei). claimRewardsMinimum needs to be set to 0.
  // What happens?
  it("Scenario 2: There's a very small amount of ETH in the rewards contract (just 1 wei).", async function() {
    // check claimRewardsMinimum state before
    expect(await rewardsContract.claimRewardsMinimum()).to.equal(claimRewardsMinimum);

    // set claimRewardsMinimum to 0
    await rewardsContract.setClaimRewardsMinimum(0);

    // check claimRewardsMinimum state after
    expect(await rewardsContract.claimRewardsMinimum()).to.equal(0);

    const user1tokensToDeposit = ethers.utils.parseEther("300");
    const user2tokensToDeposit = ethers.utils.parseEther("700");

    // check user1 and user2 staking token balance before
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    // user1 deposits 100 tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user2 deposits 200 tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit);

    // user1 should have 0 rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(0);

    // user2 should have 0 rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0);

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);

    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");

    // send 1 wei to the contract
    await owner.sendTransaction({ 
      value: String("1"), // 1 wei
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(1);

    // check rewards contract totalSupply
    expect(await rewardsContract.totalSupply()).to.equal(user1tokensToDeposit.add(user2tokensToDeposit));

    // user1: previewClaim
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(0); // looks like no one can claim

    // user2: previewClaim
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0); // looks like no one can claim
  });

  // Scenario 3: user tries to withdraw their staking tokens before the asset lock period is over

  // Scenario 4: user sends receipt tokens to another address. What happens to the rewards? (both addresses try to claim rewards)

  // Scenario 5: rewards amount is lower than claimRewardsMinimum. What happens to rewards? Can users claim?

  // Scenario 6: minUserDeposit is set to 1 wei, claimRewardsMinimum is set to 0.0001 ETH. User1 deposits 1 wei, user2 deposits 10 ETH. The reward is 0.001 ETH. How much does each user get?

  // Scenario 7: the asset token has a fee-on-transfer mechanism. How does this affect the totalSupply? Is is the same as the contracts asset balance?

  // Scenario 8: the asset token has 10 decimals (instead of 18). Does this affect the rewards calculation? How about withdrawals?
});