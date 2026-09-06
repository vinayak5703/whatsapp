// 1. VARIABLES
const loginScreen = document.querySelector('#loginScreen');
const authForm = document.querySelector('#authForm');
let registerMode = false;

function updateLiveProfile(user) {
  const name = user?.name || user?.email?.split('@')[0] || 'User';
  const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const avatar = document.querySelector('.avatar');
  const profileName = document.querySelector('.profile b');
  const profileRole = document.querySelector('.profile span');
  if (avatar) avatar.textContent = initials;
  if (profileName) profileName.textContent = name;
  if (profileRole) profileRole.textContent = user?.role || 'Operator';
}

function updateAdminAccess(role) {
  const adminLink = document.querySelector('.nav-item[data-page="Admin Panel"]');
  const isAdmin = role === 'Administrator';
  if (adminLink) adminLink.classList.toggle('hidden', !isAdmin);
  if (!isAdmin && window.location.hash === '#admin') window.location.hash = '#dashboard';
}

// 2. FUNCTIONS
function setAuthMode(register) {
  registerMode = register;
  document.querySelector('#authTitle').textContent = register ? 'Create your account' : 'Sign in to your account';
  document.querySelector('#authSub').textContent = register ? 'Your account will be securely saved in Supabase.' : 'Manage every conversation from one dashboard.';
  document.querySelector('#nameField').classList.toggle('hidden', !register);
  document.querySelector('#authSubmit').textContent = register ? 'Create Account' : 'Sign In';
  document.querySelector('#authSwitch').innerHTML = register ? 'Already have an account? <button>Sign in</button>' : 'New here? <button>Create an account</button>';
  document.querySelector('#authError').textContent = '';
}
// 3. EVENT LISTENERS
document.querySelector('#authSwitch').onclick = () => setAuthMode(!registerMode);
// 4. API CALLS — register/login requests go to the backend
authForm.onsubmit = async event => {
  event.preventDefault();
  const error = document.querySelector('#authError');
  const submit = document.querySelector('#authSubmit');
  const values = Object.fromEntries(new FormData(authForm));
  submit.disabled = true; submit.textContent = 'Please wait...'; error.textContent = '';
  try {
    const response = await window.apiFetch(registerMode ? '/api/auth/register' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Authentication failed.');
    localStorage.setItem('wa-auth-token', data.token); localStorage.setItem('wa-auth-user', JSON.stringify(data.user));
    window.location.hash = data.user.role === 'Administrator' ? '#admin' : '#dashboard';
    window.location.reload();
    return;
    loginScreen.classList.add('hidden');
    updateLiveProfile(data.user);
    updateAdminAccess(data.user.role);
    window.dispatchEvent(new Event('auth:success'));
    if (data.user.role === 'Administrator' && typeof window.navigateToPage === 'function') window.navigateToPage('Admin Panel');
  } catch (err) { error.textContent = err.message; }
  finally { submit.disabled = false; submit.textContent = registerMode ? 'Create Account' : 'Sign In'; }
};
const savedUser = JSON.parse(localStorage.getItem('wa-auth-user') || 'null');
if (!savedUser || !localStorage.getItem('wa-auth-token')) localStorage.removeItem('wa-bot-data:guest');
updateAdminAccess(savedUser?.role);
if (savedUser && localStorage.getItem('wa-auth-token')) { loginScreen.classList.add('hidden'); updateLiveProfile(savedUser); }
document.querySelector('#logoutBtn').onclick = () => { localStorage.removeItem('wa-auth-token'); localStorage.removeItem('wa-auth-user'); localStorage.removeItem('wa-bot-data:guest'); window.location.hash = '#dashboard'; window.location.reload(); };
