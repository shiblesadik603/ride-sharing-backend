import { post } from "../api.js";
import { saveSession, toast } from "../state.js";

export default {
  name: "AuthView",
  data() {
    return {
      tab: "login", // login | register | forgot | reset | verify
      loading: false,
      login: { email: "", password: "" },
      register: { email: "", password: "", firstName: "", lastName: "", phone: "" },
      forgot: { email: "" },
      reset: { token: "", newPassword: "" },
      verify: { token: "" },
    };
  },
  template: `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand">🚗 Ride Sharing</div>
        <div class="auth-sub">Full backend demo — every phase, one screen at a time</div>

        <div class="tabs" style="justify-content:center">
          <button class="tab" :class="{active: tab==='login'}" @click="tab='login'">Log in</button>
          <button class="tab" :class="{active: tab==='register'}" @click="tab='register'">Register</button>
        </div>

        <form v-if="tab==='login'" @submit.prevent="doLogin">
          <div class="field">
            <label>Email</label>
            <input v-model="login.email" type="email" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label>Password</label>
            <input v-model="login.password" type="password" required placeholder="••••••••" />
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" :disabled="loading">
            <span v-if="loading" class="spinner"></span> Log in
          </button>
          <div class="auth-switch">
            <button type="button" @click="tab='forgot'">Forgot password?</button>
          </div>
        </form>

        <form v-if="tab==='register'" @submit.prevent="doRegister">
          <div class="field-row">
            <div class="field"><label>First name</label><input v-model="register.firstName" required /></div>
            <div class="field"><label>Last name</label><input v-model="register.lastName" required /></div>
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="register.email" type="email" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label>Phone (E.164, optional)</label>
            <input v-model="register.phone" placeholder="+14155552671" />
          </div>
          <div class="field">
            <label>Password</label>
            <input v-model="register.password" type="password" required placeholder="8+ chars, upper+lower+number" />
            <div class="help">Every new account starts as a Passenger — upgrade to Driver from your profile once logged in.</div>
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" :disabled="loading">
            <span v-if="loading" class="spinner"></span> Create account
          </button>
        </form>

        <div v-if="tab==='forgot'">
          <form @submit.prevent="doForgot">
            <div class="field"><label>Email</label><input v-model="forgot.email" type="email" required /></div>
            <button class="btn btn-primary" style="width:100%;justify-content:center" :disabled="loading">Send reset link</button>
          </form>
          <div class="auth-switch"><button type="button" @click="tab='login'">← Back to login</button></div>
        </div>

        <div class="divider" v-if="tab==='login' || tab==='register'"></div>

        <details v-if="tab==='login' || tab==='register'">
          <summary class="text-sm text-muted" style="cursor:pointer">Have a verification / reset token from a server log?</summary>
          <div style="margin-top:12px">
            <div class="field">
              <label>Verify email — paste token</label>
              <div class="flex gap-8">
                <input v-model="verify.token" placeholder="token from the 'would send' log" />
                <button class="btn btn-outline btn-sm" @click="doVerify" :disabled="loading">Verify</button>
              </div>
            </div>
            <div class="field">
              <label>Reset password — paste token</label>
              <div class="flex gap-8" style="margin-bottom:6px">
                <input v-model="reset.token" placeholder="token" />
              </div>
              <input v-model="reset.newPassword" type="password" placeholder="new password" style="margin-bottom:6px" />
              <button class="btn btn-outline btn-sm" @click="doReset" :disabled="loading">Reset</button>
            </div>
          </div>
        </details>
      </div>
    </div>
  `,
  methods: {
    async doLogin() {
      this.loading = true;
      try {
        const data = await post("/auth/login", this.login);
        saveSession(data);
        toast(`Welcome back, ${data.user.firstName}`, "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async doRegister() {
      this.loading = true;
      try {
        const body = { ...this.register };
        if (!body.phone) delete body.phone;
        const data = await post("/auth/register", body);
        saveSession(data);
        toast("Account created — check the backend server console for the verification email", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async doForgot() {
      this.loading = true;
      try {
        await post("/auth/forgot-password", this.forgot);
        toast("If that email exists, a reset link was logged on the server console", "success");
        this.tab = "login";
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async doReset() {
      this.loading = true;
      try {
        await post("/auth/reset-password", this.reset);
        toast("Password reset — log in with your new password", "success");
        this.reset = { token: "", newPassword: "" };
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async doVerify() {
      this.loading = true;
      try {
        await post("/auth/verify-email", this.verify);
        toast("Email verified", "success");
        this.verify = { token: "" };
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
  },
};
