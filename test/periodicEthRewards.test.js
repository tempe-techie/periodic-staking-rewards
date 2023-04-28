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
  let rewardsContract2; // using staking token with transfer fee as asset token
  let rewardsContract3; // using staking token with 10 decimals

  let stakingTokenContract;
  let stakingTokenContract2; // staking token with transfer fee
  let stakingTokenContract3; // staking token with 10 decimals

  let stakingToken3Decimals = 10;

  let owner;
  let user1;
  let user2;
  let user3;

  let PeriodicEthRewards;

  const user1stakingTokenBalance = ethers.utils.parseEther("850"); // 850 staking tokens
  const user2stakingTokenBalance = ethers.utils.parseEther("1500"); // 1500 staking tokens

  const claimRewardsMinimum = ethers.utils.parseEther("1"); // 1 ETH as minimum rewards total per period
  const minUserDeposit = ethers.utils.parseEther("10"); // 10 asset tokens
  const claimPeriod = 604800; // 1 week

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const MockErc20Token = await ethers.getContractFactory("MockErc20Token");
    stakingTokenContract = await MockErc20Token.deploy("Staking Token", "STK");
    await stakingTokenContract.deployed();

    const MockErc20TokenWithTransferFee = await ethers.getContractFactory("MockErc20TokenWithTransferFee");
    stakingTokenContract2 = await MockErc20TokenWithTransferFee.deploy("Staking Token with tax", "STAX");
    await stakingTokenContract2.deployed();

    const MockErc20TokenWithCustomDecimals = await ethers.getContractFactory("MockErc20TokenCustomDecimals");
    stakingTokenContract3 = await MockErc20TokenWithCustomDecimals.deploy("Staking Token with 10 decimals", "STAX", stakingToken3Decimals);
    await stakingTokenContract3.deployed();

    PeriodicEthRewards = await ethers.getContractFactory("PeriodicEthRewards");
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
  it("Scenario 1: User1 deposits 300 tokens, user2 deposits 700 tokens. They claim rewards after 1 week (and again a week later).", async function () {
    const user1tokensToDeposit = ethers.utils.parseEther("300");
    const user2tokensToDeposit = ethers.utils.parseEther("700");

    // check user1 and user2 staking token balance
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    // revert: user1 tries to deposit 0 tokens
    await expect(rewardsContract.connect(user1).deposit(0)).to.be.revertedWith("PeriodicEthRewards: deposit is less than min");

    // revert: user1 tries to deposit less than the minimum deposit amount (1 wei less in staking tokens)
    await expect(rewardsContract.connect(user1).deposit(minUserDeposit.sub(1))).to.be.revertedWith("PeriodicEthRewards: deposit is less than min");

    // user1 deposits tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user2 deposits tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit);

    // revert: user1 tries to withdraw their staking tokens
    await expect(rewardsContract.connect(user1).withdraw(user1tokensToDeposit)).to.be.revertedWith("PeriodicEthRewards: assets are still locked");

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

    // withdrawals

    // revert: user1 tries to withdraw more than their balance is (add 1 wei to the deposited amount)
    await expect(rewardsContract.connect(user1).withdraw(user1tokensToDeposit.add(1))).to.be.revertedWith("PeriodicEthRewards: cannot withdraw more than balance");

    // revert: user1 tries to withdraw the amount that would leave less than the minimum deposit amount in the contract (subtract 1 wei from the deposited amount)
    await expect(rewardsContract.connect(user1).withdraw(user1tokensToDeposit.sub(1))).to.be.revertedWith("PeriodicEthRewards: the remaining balance too low");

    // revert: user1 tries to withdraw 0 tokens
    await expect(rewardsContract.connect(user1).withdraw(0)).to.be.revertedWith("PeriodicEthRewards: cannot withdraw 0");

    // send some more ETH rewards and advance time by 1 week

    // send 18 ETH to the rewards contract
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("18"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("18"));

    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");

    // send 2 more ETH to the rewards contract to trigger _updateLastClaimPeriod
    // this ETH will be added to the rewards pool for the previous claim period, so 20 ETH in total (18 ETH + 2 ETH)
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("2"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("20"));

    // user1 can have 30% of the rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(ethers.utils.parseEther("6"));

    // user2 can have 70% of the rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(ethers.utils.parseEther("14"));

    // preview claim for user3 (should be 0)
    expect(await rewardsContract.connect(user3).previewClaim(user3.address)).to.equal(0);

    // user1 ETH balance before
    const user1BalanceBefore2 = await ethers.provider.getBalance(user1.address);
    console.log("user1 ETH balance before 2: ", ethers.utils.formatEther(user1BalanceBefore2));

    // owner claims rewards for user1 (so that no gas fees are paid by user1)
    await rewardsContract.claimRewardsFor(user1.address);

    // user1 ETH balance after
    const user1BalanceAfter2 = await ethers.provider.getBalance(user1.address);
    console.log("user1 ETH balance after 2: ", ethers.utils.formatEther(user1BalanceAfter2));
    expect(user1BalanceAfter2).to.equal(user1BalanceBefore2.add(ethers.utils.parseEther("6")));

    // user2 ETH balance before
    const user2BalanceBefore2 = await ethers.provider.getBalance(user2.address);
    console.log("user2 ETH balance before 2: ", ethers.utils.formatEther(user2BalanceBefore2));

    // user2 claims rewards for themselves
    const tx2 = await rewardsContract.connect(user2).claimRewards();
    const receipt2 = await tx2.wait();
    calculateGasCosts("user claimRewards() 2", receipt);

    // user2 ETH balance after
    const user2BalanceAfter2 = await ethers.provider.getBalance(user2.address);
    console.log("user2 ETH balance after 2: ", ethers.utils.formatEther(user2BalanceAfter2));
    // expect user2 balance before to be less than user2 balance after
    expect(user2BalanceBefore2).to.be.lt(user2BalanceAfter2);

    // check rewards contract balance (should be 0 ETH)
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);
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

  // Scenario 3: user sends receipt tokens to another address. What happens to the rewards? (both addresses try to claim rewards)
  it("Scenario 3: user sends receipt tokens to another address. What happens to the rewards? (both addresses try to claim rewards)", async function() {
    // check user1 and user2 staking token balance
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    const user1tokensToDeposit = ethers.utils.parseEther("300");

    // user1 deposits 100 tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

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
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("9"))

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

    // user1: check receipt token balance
    expect(await rewardsContract.balanceOf(user1.address)).to.equal(user1tokensToDeposit);

    // user2: check receipt token balance
    expect(await rewardsContract.balanceOf(user2.address)).to.equal(0);

    // user1: preview shows 100% of the rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(ethers.utils.parseEther("10"));

    // user2: preview shows 0% of the rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0);

    // user1: get ETH balance before transfer
    const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
    console.log("user1BalanceBefore: ", ethers.utils.formatEther(user1BalanceBefore));

    // user1 transfer 150 tokens to user2
    await rewardsContract.connect(user1).transfer(user2.address, ethers.utils.parseEther("150"));

    // user1: check receipt token balance
    expect(await rewardsContract.balanceOf(user1.address)).to.equal(user1tokensToDeposit.div(2));

    // user2: check receipt token balance
    expect(await rewardsContract.balanceOf(user2.address)).to.equal(user1tokensToDeposit.div(2));

    // user1: preview shows 0% of the rewards because when the user transferred the tokens, the rewards were automatically claimed
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(0);

    // user1: get ETH balance after transfer
    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
    console.log("user1BalanceAfter: ", ethers.utils.formatEther(user1BalanceAfter));
    console.log("Difference", ethers.utils.formatEther(user1BalanceAfter.sub(user1BalanceBefore))); // should be approx. the same as the rewards amount (minus gas)

    // user2: preview shows 0% of the rewards, because user2 did not have any staked tokens before the transfer
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0);
  });

  // Scenario 4: Deposited tokens balances are too far away from each other. How does this affect the rewards calculation?
  // minUserDeposit is set to 1 wei, claimRewardsMinimum is set to 1 wei. User1 deposits 1 wei tokens, user2 deposits 10 ETH tokens. The reward is 0.001 ETH. How much does each user get?
  // Conclusion: it seems that user 1 does not get anything, because their balance is just too low. That's why minDeposit and claimRewardsMinimum should be set to a reasonably high amount.
  it("Scenario 4: Deposited tokens balances are too far away from each other. How does this affect the rewards calculation?", async function() {
    // check claimRewardsMinimum state before
    expect(await rewardsContract.claimRewardsMinimum()).to.equal(claimRewardsMinimum);

    // set claimRewardsMinimum to 1
    await rewardsContract.setClaimRewardsMinimum(1);
    expect(await rewardsContract.claimRewardsMinimum()).to.equal(1);

    // setMinDeposit to 1 wei
    await rewardsContract.setMinDeposit(1);
    expect(await rewardsContract.minDeposit()).to.equal(1);
    
    // check user1 and user2 staking token balance
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    const user1tokensToDeposit = 1; // 1 wei tokens
    const user2tokensToDeposit = ethers.utils.parseEther("10");

    // user1 deposits 1 wei tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user2 deposits 10 ETH tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit);

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);

    // send 0.0009 ETH to the rewards contract
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("0.0009"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("0.0009"));

    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");

    // send 0.0001 more ETH to the rewards contract to trigger _updateLastClaimPeriod
    // this ETH will be added to the rewards pool for the previous claim period, so 0.001 ETH in total (0.0009 ETH + 0.0001 ETH)
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("0.0001"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    const rewards = await ethers.provider.getBalance(rewardsContract.address);
    expect(rewards).to.equal(ethers.utils.parseEther("0.001"));
    console.log("rewards: ", ethers.utils.formatEther(rewards), "ETH");
    console.log("rewards: ", Number(rewards), "wei");

    // user1 claim preview
    const user1claim = await rewardsContract.connect(user1).previewClaim(user1.address);
    console.log("user1claim: ", Number(user1claim));

    // user2 claim preview
    const user2claim = await rewardsContract.connect(user2).previewClaim(user2.address);
    console.log("user2claim: ", ethers.utils.formatEther(user2claim), "ETH");
    console.log("user2claim: ", Number(user2claim), "wei");

    // preview claim for user3 (should be 0)
    expect(await rewardsContract.connect(user3).previewClaim(user3.address)).to.equal(0);

    // user1: check receipt token balance
    //expect(await rewardsContract.balanceOf(user1.address)).to.equal(user1tokensToDeposit);

    // user2: check receipt token balance
    //expect(await rewardsContract.balanceOf(user2.address)).to.equal(user2tokensToDeposit);

  });

  // Scenario 5: User has tokens deposited, the period has ended, but the user has not claimed the rewards yet.
  // Instead the user wants to deposit more thinking they'll get more rewards. What happens? (They should get 
  // rewards based on the previous balance, not the new one after the latest deposit.)
  it("Scenario 5: User makes another deposit before claiming", async function() {
    const user1tokensToDeposit = ethers.utils.parseEther("300");
    const user2tokensToDeposit = ethers.utils.parseEther("700");

    // user1 deposits tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user2 deposits tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit);

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

    // user1 receipt token balance before
    const user1ReceiptTokenBalanceBefore = await rewardsContract.balanceOf(user1.address);
    console.log("user1 receipt token balance before: ", ethers.utils.formatEther(user1ReceiptTokenBalanceBefore));

    // user1 decides to deposit some more tokens in order to get more rewards
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit);

    // user1 ETH balance after the deposit (the claim happens automatically, but for the previous deposit balance)
    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
    console.log("user1 ETH balance after: ", ethers.utils.formatEther(user1BalanceAfter));
    console.log("user1 ETH balance difference: ", ethers.utils.formatEther(user1BalanceAfter.sub(user1BalanceBefore)));
    // expect the user1 ETH balance to be increased by approximately 3 ETH (30% of the rewards)
    expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.closeTo(ethers.utils.parseEther("3"), ethers.utils.parseEther("0.01"));

    // user1 receipt token balance after the deposit
    const user1ReceiptTokenBalanceAfter = await rewardsContract.balanceOf(user1.address);
    console.log("user1 receipt token balance after: ", ethers.utils.formatEther(user1ReceiptTokenBalanceAfter));
  });

  // Scenario 6: the asset token has a fee-on-transfer mechanism. How does this affect the totalSupply? Is it the same as the contracts asset balance?
  it("Scenario 6: asset token has a fee-on-transfer mechanism (NOT SUPPORTED!)", async function() {
    rewardsContract2 = await PeriodicEthRewards.deploy(
      stakingTokenContract2.address,
      "Receipt Token",
      "RCP",
      claimRewardsMinimum, // 1 ETH as minimum rewards total per period
      minUserDeposit, // 0.0001 ETH as minimum user deposit
      claimPeriod // 1 week claim period
    );
    await rewardsContract2.deployed();

    // mint staking tokens for user1 and user2
    await stakingTokenContract2.mint(user1.address, user1stakingTokenBalance); // 850 tokens

    // check user1 staking token balance 1
    const userAssetBalance1 = await stakingTokenContract2.balanceOf(user1.address);
    console.log("user1 staking token balance 1: ", ethers.utils.formatEther(userAssetBalance1));

    // check the staking token balance of the rewards contract 1
    const rewardsContractAssetBalance1 = await stakingTokenContract2.balanceOf(rewardsContract2.address);
    console.log("rewards contract staking token balance 1: ", ethers.utils.formatEther(rewardsContractAssetBalance1));

    // check user1 receipt token balance 1
    const userReceiptTokenBalance1 = await rewardsContract2.balanceOf(user1.address);
    console.log("user1 receipt token balance 1: ", ethers.utils.formatEther(userReceiptTokenBalance1));

    const user1tokensToDeposit = ethers.utils.parseEther("300");
    console.log("user1 tokens to deposit: ", ethers.utils.formatEther(user1tokensToDeposit));

    // user1 deposits tokens
    await stakingTokenContract2.connect(user1).approve(rewardsContract2.address, user1tokensToDeposit);
    await rewardsContract2.connect(user1).deposit(user1tokensToDeposit);

    // check user1 staking token balance 2
    const userAssetBalance2 = await stakingTokenContract2.balanceOf(user1.address);
    console.log("user1 staking token balance 2: ", ethers.utils.formatEther(userAssetBalance2));

    // check user1 receipt token balance 2
    const userReceiptTokenBalance2 = await rewardsContract2.balanceOf(user1.address);
    console.log("user1 receipt token balance 2: ", ethers.utils.formatEther(userReceiptTokenBalance2));

    // check the staking token balance of the rewards contract 2
    const rewardsContractAssetBalance2 = await stakingTokenContract2.balanceOf(rewardsContract2.address);
    console.log("rewards contract staking token balance 2: ", ethers.utils.formatEther(rewardsContractAssetBalance2));

    // print out the difference between the receipt token total supply and the staking token balance of the rewards contract
    const totalSupply = await rewardsContract2.totalSupply();
    console.log("receipt token total supply: ", ethers.utils.formatEther(totalSupply));
    console.log("staking token balance of the rewards contract: ", ethers.utils.formatEther(rewardsContractAssetBalance2));
    console.log("difference: ", ethers.utils.formatEther(totalSupply.sub(rewardsContractAssetBalance2)));
    console.log("Conclusion: DO NOT USE TOKENS WITH FEE-ON-TRANSFER MECHANISM AS ASSETS/STAKING TOKENS!");
  });

  // Scenario 7: the asset token has 10 decimals (instead of 18). Does this affect the rewards calculation? How about withdrawals?
  it("Scenario 7: asset token has 10 decimals (instead of 18). How does this affect the rewards calculation? How about withdrawals?", async function() {
    rewardsContract3 = await PeriodicEthRewards.deploy(
      stakingTokenContract3.address,
      "Receipt Token",
      "RCP",
      claimRewardsMinimum, // 1 ETH as minimum rewards total per period
      minUserDeposit, // 0.0001 ETH as minimum user deposit
      claimPeriod // 1 week claim period
    );
    await rewardsContract3.deployed();

    const user1stakingToken3Balance = ethers.utils.parseUnits("850", stakingToken3Decimals);

    // mint staking tokens for user1
    await stakingTokenContract3.mint(user1.address, user1stakingToken3Balance); // 850 tokens

    // check user1 staking token balance 1
    const userAssetBalance1 = await stakingTokenContract3.balanceOf(user1.address);
    console.log("user1 staking token balance 1: ", ethers.utils.formatUnits(userAssetBalance1, stakingToken3Decimals));

    // check the staking token balance of the rewards contract 1
    const rewardsContractAssetBalance1 = await stakingTokenContract3.balanceOf(rewardsContract3.address);
    console.log("rewards contract staking token balance 1: ", ethers.utils.formatUnits(rewardsContractAssetBalance1, stakingToken3Decimals));

    // check user1 receipt token balance 1
    const userReceiptTokenBalance1 = await rewardsContract3.balanceOf(user1.address);
    console.log("user1 receipt token balance 1: ", ethers.utils.formatEther(userReceiptTokenBalance1));

    const user1tokensToDeposit = ethers.utils.parseUnits("300", stakingToken3Decimals);
    console.log("user1 tokens to deposit: ", ethers.utils.formatUnits(user1tokensToDeposit, stakingToken3Decimals));

    // setMinDeposit to 1 wei
    await rewardsContract3.setMinDeposit(1);
    expect(await rewardsContract3.minDeposit()).to.equal(1);

    // user1 deposits tokens
    await stakingTokenContract3.connect(user1).approve(rewardsContract3.address, user1tokensToDeposit);
    await rewardsContract3.connect(user1).deposit(user1tokensToDeposit);

    // check user1 staking token balance 2
    const userAssetBalance2 = await stakingTokenContract3.balanceOf(user1.address);
    console.log("user1 staking token balance 2: ", ethers.utils.formatUnits(userAssetBalance2, stakingToken3Decimals));

    // check user1 receipt token balance 2
    const userReceiptTokenBalance2 = await rewardsContract3.balanceOf(user1.address);
    console.log("user1 receipt token balance 2: ", ethers.utils.formatEther(userReceiptTokenBalance2));

    // check the staking token balance of the rewards contract 2
    const rewardsContractAssetBalance2 = await stakingTokenContract3.balanceOf(rewardsContract3.address);
    console.log("rewards contract staking token balance 2: ", ethers.utils.formatUnits(rewardsContractAssetBalance2, stakingToken3Decimals));
  
    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");
  
    // revert: user1 tries to withdraw their staking tokens
    await rewardsContract3.connect(user1).withdraw(user1tokensToDeposit);

    // check user1 staking token balance 3
    const userAssetBalance3 = await stakingTokenContract3.balanceOf(user1.address);
    console.log("user1 staking token balance 3: ", ethers.utils.formatUnits(userAssetBalance3, stakingToken3Decimals));

    // check user1 receipt token balance 3
    const userReceiptTokenBalance3 = await rewardsContract3.balanceOf(user1.address);
    console.log("user1 receipt token balance 3: ", ethers.utils.formatEther(userReceiptTokenBalance3));

    // check the staking token balance of the rewards contract 3
    const rewardsContractAssetBalance3 = await stakingTokenContract3.balanceOf(rewardsContract3.address);
    console.log("rewards contract staking token balance 3: ", ethers.utils.formatUnits(rewardsContractAssetBalance3, stakingToken3Decimals));
  });

});
