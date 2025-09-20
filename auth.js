import { generatePrivateKey, privateKeyToAccount } from 'https://esm.sh/viem/accounts';

// Storage key
const WALLET_STORAGE_KEY = 'miniWalletSessionKey';

// DOM elements for signup page
const emailInput = document.getElementById('emailInput');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const otpInput = document.getElementById('otpInput');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const newWalletDetails = document.getElementById('new-wallet-details');
const addressSpan = document.getElementById('address');
const privateKeySpan = document.getElementById('privateKey');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const copyKeyBtn = document.getElementById('copyKeyBtn');
const keySavedCheckbox = document.getElementById('keySavedCheckbox');
const proceedToWalletBtn = document.getElementById('proceedToWalletBtn');
const signupStatus = document.getElementById('signupStatus');

// DOM elements for login page
const importInput = document.getElementById('importPrivateKeyInput');
const importBtn = document.getElementById('importWalletBtn');
const loginStatus = document.getElementById('loginStatus');

// Toast utility
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

// Copy text utility
async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.innerHTML;
    button.innerHTML = 'Copied ✅';
    button.disabled = true;
    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
    }, 1500);
    showToast('Copied to clipboard!', 'success');
  } catch {
    showToast('Failed to copy.', 'error');
  }
}

// Show validation error
function showValidationError(input, message) {
  const formGroup = input.closest('.form-group');
  const errorElement = formGroup?.querySelector('.validation-error');
  if (errorElement) errorElement.textContent = message;
  formGroup?.classList.add('invalid');
}

// Clear validation error
function clearValidationError(input) {
  const formGroup = input.closest('.form-group');
  formGroup?.classList.remove('invalid');
  const errorElement = formGroup?.querySelector('.validation-error');
  if (errorElement) errorElement.textContent = '';
}

// Send OTP
if (sendOtpBtn && emailInput) {
  sendOtpBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    clearValidationError(emailInput);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showValidationError(emailInput, 'Please enter a valid email.');
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.innerHTML = 'Sending... <span class="loader"></span>';

    try {
      const response = await fetch('http://localhost:3000/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        document.getElementById('otp-section').style.display = 'block';
        showToast('OTP sent to your email!', 'success');
      } else {
        showValidationError(emailInput, data.message || 'Failed to send OTP.');
      }
    } catch (error) {
      showValidationError(emailInput, 'Error sending OTP. Try again.');
      console.error('OTP send error:', error);
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.innerHTML = 'Send OTP';
    }
  });
}

// Verify OTP and generate wallet
if (verifyOtpBtn && otpInput) {
  verifyOtpBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const otp = otpInput.value.trim();
    clearValidationError(otpInput);
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      showValidationError(otpInput, 'Please enter a valid 6-digit OTP.');
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.innerHTML = 'Verifying... <span class="loader"></span>';

    try {
      const response = await fetch('http://localhost:3000/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      if (data.verified) {
        const pk = generatePrivateKey();
        const acct = privateKeyToAccount(pk);
        newWalletDetails.style.display = 'block';
        addressSpan.textContent = acct.address;
        privateKeySpan.textContent = pk;
        keySavedCheckbox.checked = false;
        proceedToWalletBtn.disabled = true;
        showToast('OTP verified! Wallet created.', 'success');
      } else {
        showValidationError(otpInput, 'Invalid OTP.');
      }
    } catch (error) {
      showValidationError(otpInput, 'Error verifying OTP.');
      console.error('OTP verification error:', error);
    } finally {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.innerHTML = 'Verify OTP';
    }
  });
}

// Copy address
if (copyAddressBtn) {
  copyAddressBtn.addEventListener('click', () => copyText(addressSpan.textContent, copyAddressBtn));
}

// Copy private key
if (copyKeyBtn) {
  copyKeyBtn.addEventListener('click', () => copyText(privateKeySpan.textContent, copyKeyBtn));
}

// Enable proceed button
if (keySavedCheckbox) {
  keySavedCheckbox.addEventListener('change', () => {
    proceedToWalletBtn.disabled = !keySavedCheckbox.checked;
  });
}

// Proceed to wallet
if (proceedToWalletBtn) {
  proceedToWalletBtn.addEventListener('click', () => {
    const pk = privateKeySpan.textContent;
    if (!pk || pk === '-' || !pk.startsWith('0x')) {
      showToast('No valid private key found.', 'error');
      return;
    }
    sessionStorage.setItem(WALLET_STORAGE_KEY, pk);
    window.location.href = 'wallet.html';
  });
}

// Login
if (importBtn && importInput) {
  importBtn.addEventListener('click', async () => {
    const pk = importInput.value.trim();
    clearValidationError(importInput);
    if (!pk || !pk.startsWith('0x')) {
      showValidationError(importInput, 'Enter a private key starting with 0x');
      return;
    }
    importBtn.disabled = true;
    importBtn.innerHTML = 'Importing... <span class="loader"></span>';
    try {
      const acct = privateKeyToAccount(pk);
      sessionStorage.setItem(WALLET_STORAGE_KEY, pk);
      window.location.href = 'wallet.html';
      showToast('Wallet imported successfully!', 'success');
    } catch (e) {
      showValidationError(importInput, 'Invalid private key.');
      loginStatus.textContent = 'Invalid private key.';
      console.error('Invalid private key during login', e);
    } finally {
      importBtn.disabled = false;
      importBtn.innerHTML = 'Login / Import Wallet';
    }
  });
}
