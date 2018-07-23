pragma solidity 0.4.24;

contract MultiSig {
  // Events
  event Deposit(address indexed sender, uint value);
  event TransactionProposal(uint transactionId);
  event TransactionConfirmed(uint transactionId);

  // Storage Variables
  mapping(address => bool) public owners;
  mapping (uint => Transaction) public transactions;
  uint public numOfTransactions;
  struct Transaction {
    address recipient;
    uint value;
    bool sent;
    address[] signatures;
  }

  modifier isValidWallet (uint _amtOfOwners) {
    require(_amtOfOwners == 3);
    _;
  }

  modifier hasTwoSigs (uint _amtOfSigs) {
    require(_amtOfSigs == 2);
    _;
  }

  modifier isOwner () {
    require(owners[msg.sender]);
    _;
  }

  modifier isNotProposer (uint _transactionId) {
    require(transactions[_transactionId].signatures[0] != msg.sender);
    _;
  }

  modifier isValidTransaction(uint _transactionId) {
    require(transactions[_transactionId].sent == false);
    _;
  }

  constructor (address[] _owners)
  public
  isValidWallet(_owners.length){
    numOfTransactions = 0;

    for (uint i=0; i<_owners.length; i++) {
      require(!owners[_owners[i]]);
      owners[_owners[i]] = true;
    }
  }

  // Default Fallback Function
  function () public payable {
    emit Deposit(msg.sender, msg.value);
  }

  // External Functions
  // doesn't check to see if contract has enough to send amount
  function proposeTransaction (address _recipient, uint _value)
  external
  isOwner
  {
    transactions[numOfTransactions] = Transaction({
      recipient: _recipient,
      value: _value,
      sent: false,
      signatures: new address[](0)
    });
    transactions[numOfTransactions].signatures.push(msg.sender);
    emit TransactionProposal(numOfTransactions++);
  }

  function signAndSendTransaction (uint _transactionId)
  external
  isOwner
  isValidTransaction(_transactionId)
  isNotProposer(_transactionId)
  {
    transactions[_transactionId].signatures.push(msg.sender);
    transactions[_transactionId].sent = true;
    transactions[_transactionId].recipient.transfer(transactions[_transactionId].value);
    emit TransactionConfirmed(_transactionId);
  }

  // View Functions
  function getSignaturesForTransaction (uint _transactionId)
  external
  view
  isOwner
  returns (address []) {
    return transactions[_transactionId].signatures;
  }

  function getBalanceInWei ()
  external
  view
  isOwner
  returns (uint) {
    return address(this).balance;
  }
}