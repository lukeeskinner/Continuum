// Login window logic. Submits credentials to the main process, which signs in
// via Supabase and starts the capture agent on success.
const form = document.getElementById("login-form");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const errorEl = document.getElementById("error");
const submitEl = document.getElementById("submit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  submitEl.disabled = true;
  submitEl.textContent = "Signing in…";

  const res = await window.continuum.signIn(emailEl.value, passwordEl.value);

  if (!res.ok) {
    errorEl.textContent = res.error || "Sign in failed.";
    submitEl.disabled = false;
    submitEl.textContent = "Sign in";
  }
  // On success the main process closes this window and shows the overlay.
});
