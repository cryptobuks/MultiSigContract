const MultiSig = artifacts.require('./MultiSig.sol');

// Open Zeppelin assertRevert function
async function assertRevert (promise) {
  try {
    await promise;
    assert.fail('Expected revert not received');
  } catch (error) {
    const revertFound = error.message.search('revert') >= 0;
    assert(revertFound, `Expected "revert", got ${error} instead`);
  }
}

contract('MultiSig', ([owner]) => {
  // Test Addresses Taken From Ganache
  const owners = web3.eth.accounts.slice(0,3);
  const creator = web3.eth.coinbase;
  const secondOwnerSigner = web3.eth.accounts[1];
  const recipient = web3.eth.accounts[3];

  contract('Creation', () => {
    let multiSigWallet;
    beforeEach(async () => {
      multiSigWallet = await MultiSig.new(owners);
    });

    it('should revert if created with less than 3 owners', async () => {
      assertRevert(MultiSig.new(owners.slice(0,1)));
    });

    it('should intialize with three owners', async () => {
      const hasOwnerOne = await multiSigWallet.owners.call(owners[0]);
      const hasOwnerTwo = await multiSigWallet.owners.call(owners[1]);
      const hasOwnerThree = await multiSigWallet.owners.call(owners[2]);
      const hasOwnerFour = await multiSigWallet.owners.call(web3.eth.accounts[3]);

      assert.isTrue(hasOwnerOne);
      assert.isTrue(hasOwnerTwo);
      assert.isTrue(hasOwnerThree);
      assert.isFalse(hasOwnerFour);
    });
  });

  contract('Fallback Function', () => {
    let multiSigWallet;
    let depositEvent;

    beforeEach(async () => {
      multiSigWallet = await MultiSig.new(owners);
      depositEvent = multiSigWallet.Deposit();
    });

    it('should allow deposits from any address', async () => {
      // Contribution by owner
      await multiSigWallet.sendTransaction({from: creator, value:10000000000000000000});
      const balanceOne = multiSigWallet.contract.getBalanceInWei().toNumber();

      assert.equal(balanceOne, 10000000000000000000);

      // Contribution by non-owner
      await web3.eth.sendTransaction({to: multiSigWallet.contract.address, from: web3.eth.accounts[4], value:10000000000000000000});
      const balanceTwo = multiSigWallet.contract.getBalanceInWei().toNumber();

      assert.equal(balanceTwo, 20000000000000000000);
    });

    it('should fire event when a deposit is made', async function () {
      await multiSigWallet.sendTransaction({from: creator, value:100000000});
      const eventData = await depositEvent.get()

      assert.equal(eventData[0].args._contributor, owner);
      assert.equal(eventData[0].args._value.toNumber(), 100000000);
    });
  });

  contract('proposeTransaction', () => {
      let multiSigWallet;
      let transactionProposalEvent;

      beforeEach(async () => {
        multiSigWallet = await MultiSig.new(owners);
        transactionProposalEvent = multiSigWallet.TransactionProposal();
      });

      it('should not allow a non-owner to propose a transaction', async () => {
        const recipient = web3.eth.accounts[3];

        // Proposal by non-owner (ex. Non-owner recipient trying to withdraw to self)
        assertRevert(multiSigWallet.proposeTransaction(recipient, 10000000000000000000, {from: recipient}));
      });

      it('should allow an owner to propose a transaction', async () => {
        const transactionId = 0;

        // Proposal by owner
        await multiSigWallet.proposeTransaction(recipient, 10000000000000000000, {from: creator});
        const transaction = await multiSigWallet.transactions.call(transactionId, {from: creator});

        assert.equal(transaction[0], recipient);
        assert.equal(transaction[1].toNumber(), 10000000000000000000);
      });

    it('should fire event when a proposal is created', async function () {
      await multiSigWallet.proposeTransaction(recipient, 10000000000000000000, {from: creator});
      const eventData = await transactionProposalEvent.get();

      assert.equal(eventData[0].args._transactionId, 0);
    });
  });

  contract('signAndSendTransaction', () => {
    const transactionId = 0;
    let multiSigWallet;
    let transactionConfirmedEvent;

    beforeEach(async () => {
      multiSigWallet = await MultiSig.new(owners);
      await multiSigWallet.proposeTransaction(recipient, 100000000, {from: creator});
      transactionConfirmedEvent = multiSigWallet.TransactionConfirmed();
    });

    it('should not allow an owner to sign and send if contract does not have enough funds', async () => {

      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:100});

      assertRevert(multiSigWallet.signAndSendTransaction(transactionId, {from: secondOwnerSigner}));
    });

    it('should not allow an owner to sign and send if the owner proposed the transaction', async () => {

      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:9984703199999});

      assertRevert(multiSigWallet.signAndSendTransaction(transactionId, {from: creator}));
    });

    it('should allow an owner to sign and send a previously proposed transaction', async () => {

      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:9984703199999});
      await multiSigWallet.signAndSendTransaction(transactionId, {from: secondOwnerSigner});
      const transaction = await multiSigWallet.transactions.call(transactionId, {from: secondOwnerSigner});

      assert.equal(transaction[0], recipient);
      assert.equal(transaction[1].toNumber(), 100000000);
      assert.equal(transaction[2], true);
    });

    it('should fire event when a transaction is confirmed', async function () {
      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:10000000000000000000});
      await multiSigWallet.signAndSendTransaction(transactionId, {from: secondOwnerSigner});
      const eventData = await transactionConfirmedEvent.get();

      assert.equal(eventData[0].args._transactionId, 0);
    });
  });

  contract('getSignaturesForTransaction', () => {
    const transactionId = 0;
    let multiSigWallet;

    beforeEach(async () => {
      multiSigWallet = await MultiSig.new(owners);
      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:10000000000000000000});
      await multiSigWallet.proposeTransaction(recipient, 100000000, {from: creator});
    });

    it('should not allow non-owner to get signature for transaction', async () => {
      assertRevert(multiSigWallet.getSignaturesForTransaction.call(transactionId, {from: recipient}));
    });

    it('should get signatures for a given transaction id', async () => {
      const signatures = await multiSigWallet.getSignaturesForTransaction.call(transactionId, {from: secondOwnerSigner});

      assert.equal(signatures.length, 1);
      assert.equal(signatures[0], creator);
    });

    it('should get signatures for a given transaction id after second signature', async () => {
      await multiSigWallet.signAndSendTransaction(transactionId, {from: secondOwnerSigner});
      const signatures = await multiSigWallet.getSignaturesForTransaction.call(transactionId, {from: secondOwnerSigner});

      assert.equal(signatures.length, 2);
      assert.equal(signatures[0], creator);
      assert.equal(signatures[1], secondOwnerSigner);
    });
  })

  contract('getBalanceInWei', () => {
    const transactionId = 0;
    let multiSigWallet;

    beforeEach(async () => {
      multiSigWallet = await MultiSig.new(owners);
      await multiSigWallet.sendTransaction({from: secondOwnerSigner, value:9984703199999});
    });

    it('should not allow non-owner to get wallet balance', async () => {
      assertRevert(multiSigWallet.getSignaturesForTransaction.call(transactionId, {from: recipient}));
    });

    it('should get wallet balance for owner', async () => {
      const balance = await multiSigWallet.getBalanceInWei.call({from: secondOwnerSigner});

      assert.equal(balance.toNumber(), 9984703199999);
    });
  })
});