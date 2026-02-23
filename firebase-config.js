// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDx_MqAkpTHKGvov0A5QFtOGPtF7dmh-5I",
  authDomain: "cartoon-master-app.firebaseapp.com",
  projectId: "cartoon-master-app",
  storageBucket: "cartoon-master-app.firebasestorage.app",
  messagingSenderId: "49423499970",
  appId: "1:49423499970:web:adae705375ee86dc66715b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ===== Auth State =====
let currentUser = null;

// Default credits for new users
const DEFAULT_CREDITS = 10;
const CREDITS_PER_GENERATION = 1;

// ===== Auth State Listener =====
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  updateAuthUI();
  
  if (user) {
    // Check/create user document with credits
    await ensureUserDocument(user);
    await loadUserCredits();
  }
});

// ===== User Document Management =====
async function ensureUserDocument(user) {
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  
  if (!doc.exists) {
    // Create new user with default credits
    await userRef.set({
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      credits: DEFAULT_CREDITS,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      totalGenerations: 0
    });
    showToast(`Welcome! You have ${DEFAULT_CREDITS} free credits.`, 'success');
  }
}

async function loadUserCredits() {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      const credits = doc.data().credits || 0;
      updateCreditsDisplay(credits);
    }
  } catch (err) {
    console.error('Error loading credits:', err);
  }
}

async function useCredit() {
  if (!currentUser) return false;
  
  const userRef = db.collection('users').doc(currentUser.uid);
  
  try {
    const doc = await userRef.get();
    const currentCredits = doc.data()?.credits || 0;
    
    if (currentCredits < CREDITS_PER_GENERATION) {
      showToast('Not enough credits! Purchase more to continue.', 'error');
      showCreditsModal();
      return false;
    }
    
    // Deduct credit and increment generation count
    await userRef.update({
      credits: firebase.firestore.FieldValue.increment(-CREDITS_PER_GENERATION),
      totalGenerations: firebase.firestore.FieldValue.increment(1),
      lastGenerationAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await loadUserCredits();
    return true;
  } catch (err) {
    console.error('Error using credit:', err);
    return false;
  }
}

// ===== Auth Functions =====
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    hideAuthModal();
    showToast('Signed in successfully!', 'success');
  } catch (err) {
    console.error('Google sign-in error:', err);
    showToast(err.message || 'Sign-in failed', 'error');
  }
}

async function signInWithEmail(email, password) {
  try {
    await auth.signInWithEmailAndPassword(email, password);
    hideAuthModal();
    showToast('Signed in successfully!', 'success');
  } catch (err) {
    console.error('Email sign-in error:', err);
    showToast(err.message || 'Sign-in failed', 'error');
  }
}

async function signUpWithEmail(email, password) {
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    hideAuthModal();
    showToast('Account created successfully!', 'success');
  } catch (err) {
    console.error('Email sign-up error:', err);
    showToast(err.message || 'Sign-up failed', 'error');
  }
}

async function signOut() {
  try {
    await auth.signOut();
    showToast('Signed out', 'success');
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}

async function resetPassword(email) {
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Password reset email sent!', 'success');
  } catch (err) {
    console.error('Password reset error:', err);
    showToast(err.message || 'Failed to send reset email', 'error');
  }
}

// ===== Image Storage =====
async function uploadShareImage(imageDataUrl, metadata = {}) {
  if (!currentUser) {
    showToast('Sign in to share images');
    return null;
  }
  
  try {
    // Convert data URL to blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    // Generate unique share ID
    const shareId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileName = `share-${shareId}.png`;
    
    // Upload to Storage
    const storageRef = storage.ref(`shares/${shareId}/${fileName}`);
    const uploadTask = await storageRef.put(blob);
    const downloadURL = await uploadTask.ref.getDownloadURL();
    
    // Save metadata to Firestore
    const shareDoc = await db.collection('shares').add({
      userId: currentUser.uid,
      userEmail: currentUser.email,
      imageUrl: downloadURL,
      prompt: metadata.prompt || '',
      style: metadata.style || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    const shareUrl = `${getShareUrl()}/share/${shareDoc.id}`;
    
    return {
      shareId: shareDoc.id,
      imageUrl: downloadURL,
      shareUrl: shareUrl
    };
  } catch (err) {
    console.error('Upload error:', err);
    showToast('Failed to upload image', 'error');
    return null;
  }
}

async function getSharedImage(shareId) {
  try {
    const doc = await db.collection('shares').doc(shareId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (err) {
    console.error('Error fetching share:', err);
    return null;
  }
}

// ===== UI Updates =====
function updateAuthUI() {
  const authBtn = document.getElementById('authBtn');
  const userMenu = document.getElementById('userMenu');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  
  if (currentUser) {
    if (authBtn) authBtn.style.display = 'none';
    if (userMenu) {
      userMenu.style.display = 'flex';
      if (userAvatar) {
        userAvatar.src = currentUser.photoURL || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239898b0"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 6v2h16v-2c0-3-2-6-8-6z"/></svg>';
      }
      if (userName) {
        userName.textContent = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
      }
    }
  } else {
    if (authBtn) authBtn.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
  }
}

function updateCreditsDisplay(credits) {
  const creditsDisplay = document.getElementById('creditsDisplay');
  if (creditsDisplay) {
    creditsDisplay.textContent = credits;
  }
}

// ===== Modals =====
function showAuthModal(mode = 'signin') {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('active');
    switchAuthMode(mode);
  }
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function switchAuthMode(mode) {
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const signinTab = document.getElementById('signinTab');
  const signupTab = document.getElementById('signupTab');
  
  if (mode === 'signin') {
    if (signinForm) signinForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
    if (signinTab) signinTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
  } else {
    if (signinForm) signinForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'block';
    if (signinTab) signinTab.classList.remove('active');
    if (signupTab) signupTab.classList.add('active');
  }
}

function showCreditsModal() {
  const modal = document.getElementById('creditsModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function hideCreditsModal() {
  const modal = document.getElementById('creditsModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// ===== Credits Purchase (Placeholder for Stripe) =====
const CREDIT_PACKAGES = [
  { id: 'starter', credits: 20, price: 4.99, popular: false },
  { id: 'creator', credits: 50, price: 9.99, popular: true },
  { id: 'pro', credits: 150, price: 24.99, popular: false }
];

async function purchaseCredits(packageId) {
  if (!currentUser) {
    showAuthModal();
    return;
  }
  
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) return;
  
  // TODO: Integrate Stripe checkout
  // For now, show placeholder message
  showToast(`Stripe integration coming soon! Package: ${pkg.credits} credits for $${pkg.price}`, 'info');
  
  // Placeholder: In production, this would:
  // 1. Create a Stripe checkout session
  // 2. Redirect to Stripe
  // 3. Handle webhook to add credits after successful payment
  
  /*
  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        packageId, 
        userId: currentUser.uid 
      })
    });
    const { sessionUrl } = await response.json();
    window.location.href = sessionUrl;
  } catch (err) {
    showToast('Payment failed. Please try again.', 'error');
  }
  */
}

// ===== Initialize Auth Event Listeners =====
function initAuthListeners() {
  // Auth button
  const authBtn = document.getElementById('authBtn');
  if (authBtn) {
    authBtn.addEventListener('click', () => showAuthModal('signin'));
  }
  
  // Close auth modal
  const closeAuth = document.getElementById('closeAuth');
  if (closeAuth) {
    closeAuth.addEventListener('click', hideAuthModal);
  }
  
  // Auth modal backdrop
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) hideAuthModal();
    });
  }
  
  // Tab switching
  const signinTab = document.getElementById('signinTab');
  const signupTab = document.getElementById('signupTab');
  if (signinTab) signinTab.addEventListener('click', () => switchAuthMode('signin'));
  if (signupTab) signupTab.addEventListener('click', () => switchAuthMode('signup'));
  
  // Google sign-in
  const googleSigninBtn = document.getElementById('googleSigninBtn');
  if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', signInWithGoogle);
  }
  
  // Email sign-in form
  const emailSigninForm = document.getElementById('emailSigninForm');
  if (emailSigninForm) {
    emailSigninForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('signinEmail').value;
      const password = document.getElementById('signinPassword').value;
      signInWithEmail(email, password);
    });
  }
  
  // Email sign-up form
  const emailSignupForm = document.getElementById('emailSignupForm');
  if (emailSignupForm) {
    emailSignupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      signUpWithEmail(email, password);
    });
  }
  
  // Forgot password
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', () => {
      const email = document.getElementById('signinEmail').value;
      if (email) {
        resetPassword(email);
      } else {
        showToast('Enter your email first');
      }
    });
  }
  
  // Sign out
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', signOut);
  }
  
  // Credits modal
  const creditsBtn = document.getElementById('creditsBtn');
  if (creditsBtn) {
    creditsBtn.addEventListener('click', showCreditsModal);
  }
  
  const closeCredits = document.getElementById('closeCredits');
  if (closeCredits) {
    closeCredits.addEventListener('click', hideCreditsModal);
  }
  
  const creditsModal = document.getElementById('creditsModal');
  if (creditsModal) {
    creditsModal.addEventListener('click', (e) => {
      if (e.target === creditsModal) hideCreditsModal();
    });
  }
  
  // Credit package buttons
  document.querySelectorAll('.credit-package-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      purchaseCredits(btn.dataset.package);
    });
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initAuthListeners);
