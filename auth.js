const loginScreen = document.querySelector('#loginScreen');
const authForm = document.querySelector('#authForm');
let registerMode = false;

function setAuthMode(register) {
  registerMode = register;
  document.querySelector('#authTitle').textContent = register ? 'Create your account' : 'Sign in to your account';
  document.querySelector('#authSub').textContent = register ? 'Your account will be securely saved in Supabase.' : 'Manage every conversation from one dashboard.';
  document.querySelector('#nameField').classList.toggle('hidden', !register);
  document.querySelector('#authSubmit').textContent = register ? 'Create Account' : 'Sign In';
  document.querySelector('#authSwitch').innerHTML = register ? 'Already have an account? <button>Sign in</button>' : 'New here? <button>Create an account</button>';
  document.querySelector('#authError').textContent = '';
}
document.querySelector('#authSwitch').onclick = () => setAuthMode(!registerMode);
authForm.onsubmit = async event => {
  event.preventDefault();
  const error = document.querySelector('#authError');
  const submit = document.querySelector('#authSubmit');
  const values = Object.fromEntries(new FormData(authForm));
  submit.disabled = true; submit.textContent = 'Please wait...'; error.textContent = '';
  try {
    const response = await fetch(registerMode ? '/api/auth/register' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Authentication failed.');
    localStorage.setItem('wa-auth-token', data.token); localStorage.setItem('wa-auth-user', JSON.stringify(data.user));
    loginScreen.classList.add('hidden');
    document.querySelector('.profile b').textContent = data.user.name;
    document.querySelector('.profile span').textContent = data.user.role;
  } catch (err) { error.textContent = err.message; }
  finally { submit.disabled = false; submit.textContent = registerMode ? 'Create Account' : 'Sign In'; }
};
const savedUser = JSON.parse(localStorage.getItem('wa-auth-user') || 'null');
if (savedUser && localStorage.getItem('wa-auth-token')) { loginScreen.classList.add('hidden'); document.querySelector('.profile b').textContent = savedUser.name; document.querySelector('.profile span').textContent = savedUser.role; }
document.querySelector('#logoutBtn').onclick = () => { localStorage.removeItem('wa-auth-token'); localStorage.removeItem('wa-auth-user'); authForm.reset(); setAuthMode(false); loginScreen.classList.remove('hidden'); };
