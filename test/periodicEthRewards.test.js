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

  const claimRewardsMinimum = ethers.utils.parseEther("10");
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
      claimRewardsMinimum, // 10 ETH as minimum rewards total per period
      minUserDeposit, // 0.0001 ETH as minimum user deposit
      claimPeriod // 1 week claim period
    );
    await rewardsContract.deployed();

    // mint staking tokens for user1 and user2
    await stakingTokenContract.mint(user1.address, user1stakingTokenBalance); // 850 tokens
    await stakingTokenContract.mint(user2.address, user2stakingTokenBalance); // 1500 tokens
  });

  // scenario 1: user1 deposits 100 tokens, user2 deposits 200 tokens
  // user1 should get 30% of the rewards and user2 should get 70% of the rewards after 1 week
  it("should distribute rewards correctly", async function () {
    const user1tokensToDeposit = ethers.utils.parseEther("300");
    const user2tokensToDeposit = ethers.utils.parseEther("700");

    // check user1 and user2 staking token balance before
    expect(await stakingTokenContract.balanceOf(user1.address)).to.equal(user1stakingTokenBalance);
    expect(await stakingTokenContract.balanceOf(user2.address)).to.equal(user2stakingTokenBalance);

    // user1 deposits 100 tokens
    await stakingTokenContract.connect(user1).approve(rewardsContract.address, user1tokensToDeposit);
    await rewardsContract.connect(user1).deposit(user1tokensToDeposit, user1.address);

    // user2 deposits 200 tokens
    await stakingTokenContract.connect(user2).approve(rewardsContract.address, user2tokensToDeposit);
    await rewardsContract.connect(user2).deposit(user2tokensToDeposit, user2.address);

    // user1 should have 0 rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(0);

    // user2 should have 0 rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(0);

    // check rewards contract balance before
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(0);

    // send 10 ETH to the rewards contract
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("9"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("9"));

    // advance time by 1 week
    await ethers.provider.send("evm_increaseTime", [604801]); // 1 week + 1 second
    await ethers.provider.send("evm_mine");

    // send some more ETH to the rewards contract to trigger _updateLastClaimPeriod
    // this ETH will be added to the rewards pool for the previous claim period, so 10 ETH in total (9 ETH + 1 ETH)
    await owner.sendTransaction({ 
      value: ethers.utils.parseEther("1"),
      to: rewardsContract.address 
    });

    // check rewards contract balance
    expect(await ethers.provider.getBalance(rewardsContract.address)).to.equal(ethers.utils.parseEther("10"));

    // user1 should have 30% of the rewards
    expect(await rewardsContract.connect(user1).previewClaim(user1.address)).to.equal(ethers.utils.parseEther("3"));

    // user2 should have 70% of the rewards
    expect(await rewardsContract.connect(user2).previewClaim(user2.address)).to.equal(ethers.utils.parseEther("7"));

    // todo: claim rewards
  });
});