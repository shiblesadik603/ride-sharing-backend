import { createApp, computed } from "https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js";
import { state, currentSession, currentUser, switchSession, removeSession, toast } from "./state.js";
import AuthView from "./views/auth.js";
import DashboardView from "./views/dashboard.js";
import ProfileView from "./views/profile.js";
import NotificationsView from "./views/notifications.js";
import RatingsView from "./views/ratings.js";
import WalletView from "./views/wallet.js";
import VehiclesView from "./views/vehicles.js";
import DriverView from "./views/driver.js";
import RidesView from "./views/rides.js";
import AdminView from "./views/admin.js";

// Views are registered here as each one is built. A nav item whose view
// key has no entry yet falls back to PlaceholderView so the sidebar can
// list the full, final navigation from day one without breaking on
// modules that don't exist yet.
const views = {
  auth: AuthView,
  dashboard: DashboardView,
  profile: ProfileView,
  notifications: NotificationsView,
  ratings: RatingsView,
  wallet: WalletView,
  vehicles: VehiclesView,
  driver: DriverView,
  rides: RidesView,
  admin: AdminView,
};

const PlaceholderView = {
  name: "PlaceholderView",
  props: ["title"],
  template: `
    <div class="empty-state">
      <div class="icon">🚧</div>
      <div>{{ title }} isn't wired up in this build yet.</div>
    </div>
  `,
};

// [{ key, label, icon, roles }] — roles: null = every logged-in role.
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "🏠", roles: null },
  { key: "rides", label: "Rides", icon: "🚕", roles: ["PASSENGER"] },
  { key: "driver", label: "Driver Console", icon: "🧭", roles: ["DRIVER"] },
  { key: "vehicles", label: "Vehicles", icon: "🚙", roles: ["DRIVER"] },
  { key: "wallet", label: "Wallet", icon: "💳", roles: ["PASSENGER", "DRIVER"] },
  { key: "ratings", label: "Ratings", icon: "⭐", roles: ["PASSENGER", "DRIVER"] },
  { key: "notifications", label: "Notifications", icon: "🔔", roles: null },
  { key: "profile", label: "Profile", icon: "👤", roles: ["PASSENGER", "DRIVER"] },
  { key: "admin", label: "Admin", icon: "🛡️", roles: ["ADMIN"] },
];

const RootApp = {
  name: "RootApp",
  setup() {
    const user = computed(() => currentUser());
    const sessions = computed(() => Object.values(state.sessions));
    const navItems = computed(() =>
      NAV.filter((n) => !n.roles || n.roles.includes(user.value?.role))
    );
    const activeComponent = computed(() => views[state.view] ?? null);
    const activeLabel = computed(
      () => NAV.find((n) => n.key === state.view)?.label ?? "Dashboard"
    );

    function go(key) {
      state.view = key;
    }

    function logout() {
      const id = state.activeUserId;
      removeSession(id);
      toast("Logged out", "info");
    }

    function addAccount() {
      state.addingAccount = true;
    }

    function cancelAddAccount() {
      state.addingAccount = false;
    }

    return { user, sessions, navItems, activeComponent, activeLabel, state, go, logout, switchSession, addAccount, cancelAddAccount };
  },
  components: { AuthView, PlaceholderView },
  template: `
    <div>
      <div v-if="!user || state.addingAccount" style="position:relative">
        <button
          v-if="sessions.length"
          class="btn btn-ghost btn-sm"
          style="position:absolute;top:20px;left:20px;z-index:10;color:#e5e3ff"
          @click="cancelAddAccount"
        >← Back to {{ user?.firstName ?? 'app' }}</button>
        <AuthView />
      </div>
      <div v-else class="shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-badge">🚗</div>
            Ride Sharing
          </div>

          <div class="nav-section-label">Sessions</div>
          <button
            v-for="s in sessions"
            :key="s.user.id"
            class="nav-item"
            :class="{ active: s.user.id === state.activeUserId }"
            @click="switchSession(s.user.id)"
          >
            <span class="icon">{{ s.user.role === 'ADMIN' ? '🛡️' : s.user.role === 'DRIVER' ? '🚘' : '🙋' }}</span>
            {{ s.user.firstName }} · {{ s.user.role }}
          </button>
          <button class="nav-item" @click="addAccount">
            <span class="icon">➕</span> Add another role
          </button>

          <div class="nav-section-label">Menu</div>
          <button
            v-for="item in navItems"
            :key="item.key"
            class="nav-item"
            :class="{ active: state.view === item.key }"
            @click="go(item.key)"
          >
            <span class="icon">{{ item.icon }}</span> {{ item.label }}
          </button>

          <div class="session-card">
            <div class="name">{{ user.firstName }} {{ user.lastName }}</div>
            <div>{{ user.email }}</div>
            <span class="badge badge-info role-badge">{{ user.role }}</span>
            <div style="margin-top:10px">
              <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" @click="logout">Log out</button>
            </div>
          </div>
        </aside>

        <main class="main">
          <div class="topbar">
            <div>
              <div class="page-title">{{ activeLabel }}</div>
              <div class="page-sub">Live data from the real backend — every action hits a real endpoint.</div>
            </div>
          </div>

          <component :is="activeComponent" v-if="activeComponent" />
          <PlaceholderView v-else :title="activeLabel" />
        </main>
      </div>

      <div class="toast-stack">
        <div v-for="t in state.toasts" :key="t.id" class="toast" :class="'toast-' + t.type">{{ t.message }}</div>
      </div>
    </div>
  `,
};

createApp(RootApp).mount("#app");
