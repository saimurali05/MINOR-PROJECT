import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  isAddress,
} from 'https://esm.sh/viem';
import { holesky } from 'https://esm.sh/viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'https://esm.sh/viem/accounts';

// DOM Elements
const addressSpan = document.getElementById('address');
const privateKeySpan = document.getElementById('privateKey');
const balanceSpan = document.getElementById('balance');
const toInput = document.getElementById('to');
const amountInput = document.getElementById('amount');
const txStatusP = document.getElementById('txStatus');
const sendEthBtn = document.getElementById('sendEthBtn');
const gasFeeSpan = document.getElementById('gasFee');
const logoutBtn = document.getElementById('logoutBtn');
const revealKeyBtn = document.getElementById('revealKeyBtn');
const historyCard = document.getElementById('historyCard');
const txList = document.getElementById('txList');
const addressBookModal = document.getElementById('addressBookModal');
const closeAddressBookModalBtn = document.getElementById('closeAddressBookModalBtn');
const contactList = document.getElementById('contactList');
const contactNameInput = document.getElementById('contactNameInput');
const contactAddressInput = document.getElementById('contactAddressInput');
const addContactBtn = document.getElementById('addContactBtn');
const openAddressBookBtn = document.getElementById('openAddressBookBtn');

// Transaction Filter
const filterContainer = document.createElement('div');
filterContainer.className = 'filter-container';
filterContainer.innerHTML = `
  <label for="txFilter">Filter Transactions:</label>
  <select id="txFilter" aria-label="Filter transactions by direction">
    <option value="all">All</option>
    <option value="in">Incoming</option>
    <option value="out">Outgoing</option>
  </select>
`;

// Viem Client Setup
const HOLESKY_RPC = 'https://ethereum-holesky-rpc.publicnode.com';
const publicClient = createPublicClient({
  chain: holesky,
  transport: http(HOLESKY_RPC),
});

// Etherscan API Key (Replace with your own)
const ETHERSCAN_API_KEY = 'W2SS691E3NKUTZGXV4YHF56VM67WR5U7CF';

// App State
const ADDRESS_BOOK_STORAGE_KEY = 'miniWalletAddressBook';
const WALLET_STORAGE_KEY = 'miniWalletSessionKey';
let estimatedGasCost = 0n;
let addressBook = [];
let account;
let walletClient;
let balanceInterval;

// UI Helpers
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

function showValidationError(inputElement, message) {
  const formGroup = inputElement.closest('.form-group');
  if (!formGroup) return;
  const errorElement = formGroup.querySelector('.validation-error');
  if (errorElement) errorElement.textContent = message;
  formGroup.classList.add('invalid');
}

function clearValidationError(inputElement) {
  const formGroup = inputElement.closest('.form-group');
  if (formGroup) formGroup.classList.remove('invalid');
}

// Wallet UI Update
async function updateWalletUI(newAccount, privateKey) {
  if (balanceInterval) clearInterval(balanceInterval);

  if (privateKey) {
    sessionStorage.setItem(WALLET_STORAGE_KEY, privateKey);
  }

  account = newAccount;
  walletClient = createWalletClient({
    account,
    chain: holesky,
    transport: http(HOLESKY_RPC),
  });

  addressSpan.textContent = account.address;
  privateKeySpan.textContent = privateKey ? '••••••••••••••••••••••••••••••••••••••••••••••••••••••••' : 'Imported (hidden)';
  balanceSpan.textContent = 'Fetching...';
  balanceSpan.classList.add('loading');
  balanceSpan.innerHTML = '<span class="loader"></span>';

  await updateBalance();
  await displayTransactionHistory();

  balanceInterval = setInterval(updateBalance, 15000);
  clearSendForm();
}

// Generate Wallet
async function generateWallet() {
  try {
    const privateKey = generatePrivateKey();
    const newAccount = privateKeyToAccount(privateKey);
    await updateWalletUI(newAccount, privateKey);
    showToast('New wallet created successfully!', 'success');
  } catch (error) {
    console.error('Error generating wallet:', error);
    showToast('Could not generate wallet.', 'error');
  }
}

// Balance Fetch
async function updateBalance() {
  if (!account) return;
  balanceSpan.classList.add('loading');
  balanceSpan.innerHTML = '<span class="loader"></span>';

  try {
    const balance = await publicClient.getBalance({ address: account.address });
    const faucetInfo = document.getElementById('faucet-info');
    balanceSpan.textContent = `${formatEther(balance)} ETH`;
    if (faucetInfo) faucetInfo.style.display = balance === 0n ? 'block' : 'none';
  } catch (error) {
    console.error('Could not fetch balance:', error);
    balanceSpan.textContent = 'Error fetching balance';
    showToast('Failed to fetch balance.', 'error');
  } finally {
    balanceSpan.classList.remove('loading');
  }
}

// Transaction History
async function displayTransactionHistory(filter = 'all') {
  if (!account) return;

  const cacheKey = `txHistory_${account.address}_${filter}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      renderTransactions(data, filter);
      return;
    }
  }

  historyCard.style.display = 'block';
  txList.innerHTML = '<p>Loading history...</p><span class="loader"></span>';

  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === 'YOUR_ETHERSCAN_API_KEY_HERE') {
    txList.innerHTML = '<p>Please add an Etherscan API key in wallet.js to view history.</p>';
    showToast('Etherscan API key missing.', 'error');
    return;
  }

  try {
    const apiUrl = `https://api-holesky.etherscan.io/api?module=account&action=txlist&address=${account.address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.status !== '1') {
      if (data.message?.toLowerCase().includes('no transactions')) {
        txList.innerHTML = '<p>No transactions found for this address.</p>';
      } else {
        throw new Error(data.message || 'Could not fetch history.');
      }
      return;
    }

    localStorage.setItem(cacheKey, JSON.stringify({ data: data.result, timestamp: Date.now() }));
    renderTransactions(data.result, filter);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    txList.innerHTML = '<p>Could not load transaction history.</p>';
    showToast('Failed to load transaction history.', 'error');
  }
}

function renderTransactions(transactions, filter) {
  txList.innerHTML = '';
  const filtered = transactions.filter(tx => {
    const isOut = tx.from.toLowerCase() === account.address.toLowerCase();
    if (filter === 'in') return !isOut;
    if (filter === 'out') return isOut;
    return true;
  });

  if (filtered.length === 0) {
    txList.innerHTML = '<p>No transactions match the filter.</p>';
    return;
  }

  filtered.slice(0, 10).forEach(tx => {
    const isOut = tx.from.toLowerCase() === account.address.toLowerCase();
    const direction = isOut ? 'OUT' : 'IN';
    const counterparty = isOut ? tx.to : tx.from;
    const value = formatEther(tx.value);
    const explorerUrl = `${publicClient.chain.blockExplorers?.default?.url ?? 'https://holesky.etherscan.io'}/tx/${tx.hash}`;

    const txItem = document.createElement('div');
    txItem.className = 'tx-item';
    txItem.setAttribute('role', 'listitem');
    txItem.innerHTML = `
      <div class="tx-details">
        <span class="tx-direction tx-direction-${direction.toLowerCase()}">${direction}</span>
        <div>
          <div><strong>${parseFloat(value).toFixed(5)} ETH</strong></div>
          <div class="tx-address">${isOut ? 'To' : 'From'}: ${truncateAddress(counterparty)}</div>
        </div>
      </div>
      <div class="tx-link">
        <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" aria-label="View transaction on Holesky explorer">Details ↗</a>
      </div>
    `;
    txList.appendChild(txItem);
  });
}

// Form Validation and Gas Estimation
function validateAmount() {
  const amountValue = amountInput.value;
  const amountNum = parseFloat(amountValue);
  if (!amountValue || isNaN(amountNum) || amountNum <= 0) {
    showValidationError(amountInput, 'Please enter a valid amount greater than 0.');
    return false;
  } else {
    clearValidationError(amountInput);
    return true;
  }
}

async function getRecipientAddress() {
  const toValue = toInput.value.trim();
  clearValidationError(toInput);

  if (!toValue) {
    showValidationError(toInput, 'Please enter a valid address.');
    return null;
  }

  if (isAddress(toValue)) {
    return toValue;
  } else {
    showValidationError(toInput, 'Please enter a valid address.');
    return null;
  }
}

async function updateAndShowGasEstimate() {
  gasFeeSpan.textContent = 'Estimating...';
  gasFeeSpan.classList.add('loading');
  gasFeeSpan.innerHTML = '<span class="loader"></span>';

  const to = await getRecipientAddress();
  if (!account || !to || !validateAmount()) {
    gasFeeSpan.textContent = '-';
    gasFeeSpan.classList.remove('loading');
    estimatedGasCost = 0n;
    return;
  }

  try {
    const amount = amountInput.value;
    const value = parseEther(amount);
    const gas = await publicClient.estimateGas({
      account,
      to,
      value,
    });
    const gasPrice = await publicClient.getGasPrice();
    estimatedGasCost = gas * gasPrice;
    gasFeeSpan.textContent = `${formatEther(estimatedGasCost)} ETH`;
  } catch (error) {
    console.error('Gas estimation failed:', error);
    gasFeeSpan.textContent = 'Unavailable';
    showToast('Gas estimation failed.', 'error');
  } finally {
    gasFeeSpan.classList.remove('loading');
  }
}

function clearSendForm() {
  toInput.value = '';
  amountInput.value = '';
  txStatusP.innerHTML = '';
  gasFeeSpan.textContent = '-';
  clearValidationError(toInput);
  clearValidationError(amountInput);
}

// Address Book
function loadAddressBook() {
  const stored = localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY);
  addressBook = stored ? JSON.parse(stored) : [];
}

function saveAddressBook() {
  localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(addressBook));
}

function renderAddressBook() {
  contactList.innerHTML = '';
  if (addressBook.length === 0) {
    contactList.innerHTML = '<p>No contacts saved yet.</p>';
    return;
  }

  addressBook.forEach(contact => {
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="contact-info">
        <div class="name">${contact.name}</div>
        <div class="address">${truncateAddress(contact.address)}</div>
      </div>
      <div class="contact-actions">
        <button class="select-contact-btn" data-address="${contact.address}" aria-label="Select contact ${contact.name}">Select</button>
        <button class="delete-contact-btn delete" data-address="${contact.address}" aria-label="Delete contact ${contact.name}">Delete</button>
      </div>
    `;
    contactList.appendChild(item);
  });
}

function addContact() {
  const name = contactNameInput.value.trim();
  const address = contactAddressInput.value.trim();
  clearValidationError(contactNameInput);
  clearValidationError(contactAddressInput);

  let isFormValid = true;
  if (!name) {
    showValidationError(contactNameInput, 'Name cannot be empty.');
    isFormValid = false;
  }
  if (!isAddress(address)) {
    showValidationError(contactAddressInput, 'Please enter a valid Ethereum address.');
    isFormValid = false;
  } else if (addressBook.some(c => c.address.toLowerCase() === address.toLowerCase())) {
    showValidationError(contactAddressInput, 'This address is already in your book.');
    isFormValid = false;
  }

  if (!isFormValid) return;

  addressBook.push({ name, address });
  saveAddressBook();
  renderAddressBook();
  showToast('Contact added!', 'success');
  contactNameInput.value = '';
  contactAddressInput.value = '';
}

function handleContactListClick(event) {
  const target = event.target;
  const address = target.dataset.address;
  if (!address) return;

  if (target.classList.contains('select-contact-btn')) {
    toInput.value = address;
    closeAddressBookModal();
    showToast('Recipient address populated.', 'success');
  } else if (target.classList.contains('delete-contact-btn')) {
    if (confirm('Are you sure you want to delete this contact?')) {
      addressBook = addressBook.filter(c => c.address !== address);
      saveAddressBook();
      renderAddressBook();
      showToast('Contact deleted.', 'info');
    }
  }
}

function truncateAddress(address) {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Copy Address
function copyAddress(event) {
  const address = addressSpan.textContent;
  const copyButton = event.currentTarget;

  if (address && address !== '-') {
    navigator.clipboard.writeText(address).then(() => {
      const originalText = copyButton.innerHTML;
      copyButton.innerHTML = 'Copied! ✅';
      copyButton.disabled = true;
      setTimeout(() => {
        copyButton.innerHTML = originalText;
        copyButton.disabled = false;
      }, 2000);
      showToast('Address copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy address: ', err);
      showToast('Failed to copy address.', 'error');
    });
  }
}

// Send ETH
async function sendETH() {
  if (!walletClient || !account) {
    showToast('Please create or import a wallet first.', 'info');
    return;
  }

  sendEthBtn.disabled = true;
  sendEthBtn.innerHTML = 'Sending... <span class="loader"></span>';

  try {
    const recipientAddress = await getRecipientAddress();
    if (!recipientAddress || !validateAmount()) return;

    const amountInWei = parseEther(amountInput.value);
    const totalCost = amountInWei + estimatedGasCost;
    const balance = await publicClient.getBalance({ address: account.address });

    if (balance < totalCost) {
      showToast(`Insufficient funds. Total cost is approx. ${formatEther(totalCost)} ETH.`, 'error');
      return;
    }

    const to = await getRecipientAddress();
    const txHash = await walletClient.sendTransaction({
      to,
      value: parseEther(amountInput.value),
    });

    const explorerUrl = `${publicClient.chain.blockExplorers?.default?.url ?? 'https://holesky.etherscan.io'}/tx/${txHash}`;
    txStatusP.innerHTML = `Transaction sent! Waiting for confirmation... <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" aria-label="View transaction on Holesky explorer">View on Explorer</a>`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === 'success' || receipt.status === 1) {
      txStatusP.innerHTML = `Transaction confirmed! ✅ <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" aria-label="View transaction on Holesky explorer">View on Explorer</a>`;
      showToast('Transaction successful!', 'success');
    } else {
      txStatusP.innerHTML = `Transaction failed. ❌ <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer" aria-label="View transaction on Holesky explorer">View on Explorer</a>`;
      showToast('Transaction failed to confirm.', 'error');
    }

    updateBalance();
    displayTransactionHistory();
    clearSendForm();
  } catch (error) {
    console.error('Transaction failed:', error);
    txStatusP.textContent = `Error: ${error.message || error}`;
    showToast(error.shortMessage || 'Transaction failed.', 'error');
  } finally {
    sendEthBtn.disabled = false;
    sendEthBtn.innerHTML = '🚀 Send';
  }
}

// Reveal Private Key
if (revealKeyBtn) {
  revealKeyBtn.addEventListener('click', () => {
    const pk = sessionStorage.getItem(WALLET_STORAGE_KEY);
    if (pk) {
      privateKeySpan.textContent = pk;
      revealKeyBtn.style.display = 'none';
      showToast('Private key revealed. Keep it secure!', 'info');
    }
  });
}

// Wallet State Management
async function loadWalletFromStorage() {
  const pk = sessionStorage.getItem(WALLET_STORAGE_KEY);
  if (pk) {
    try {
      const savedAccount = privateKeyToAccount(pk);
      await updateWalletUI(savedAccount);
    } catch (error) {
      console.error('Failed to load wallet from session storage:', error);
      sessionStorage.removeItem(WALLET_STORAGE_KEY);
    }
  }
}

function logout() {
  sessionStorage.removeItem(WALLET_STORAGE_KEY);
  showToast('Logged out successfully.', 'info');
  window.location.href = 'index.html';
}

// Modals
function openAddressBookModal() {
  renderAddressBook();
  addressBookModal.classList.add('show');
}

function closeAddressBookModal() {
  addressBookModal.classList.remove('show');
  clearValidationError(contactNameInput);
  clearValidationError(contactAddressInput);
}

// Debounce Utility
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Event Listeners
document.getElementById('generateWalletBtn')?.addEventListener('click', generateWallet);
document.getElementById('copyAddressBtn')?.addEventListener('click', copyAddress);
sendEthBtn.addEventListener('click', sendETH);
logoutBtn?.addEventListener('click', logout);
openAddressBookBtn.addEventListener('click', openAddressBookModal);
addContactBtn.addEventListener('click', addContact);
contactList.addEventListener('click', handleContactListClick);
closeAddressBookModalBtn.addEventListener('click', closeAddressBookModal);
addressBookModal.addEventListener('click', (event) => {
  if (event.target === addressBookModal) closeAddressBookModal();
});

const debouncedGasEstimate = debounce(updateAndShowGasEstimate, 300);
toInput.addEventListener('input', debouncedGasEstimate);
amountInput.addEventListener('input', debouncedGasEstimate);

document.addEventListener('DOMContentLoaded', () => {
  loadWalletFromStorage();
  loadAddressBook();
  if (historyCard) {
    historyCard.insertBefore(filterContainer, txList);
    const txFilter = document.getElementById('txFilter');
    txFilter.addEventListener('change', () => displayTransactionHistory(txFilter.value));
  }
});
