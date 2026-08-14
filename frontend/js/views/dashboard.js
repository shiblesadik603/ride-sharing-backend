import { get } from "../api.js";
import { currentUser, toast } from "../state.js";

export default {
  name: "DashboardView",
  data() {
    return {
      loading: true,
      wallet: null,
      rides: [],
      admin: null,
    };
  },
  computed: {
    user() {
      return currentUser();
    },
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        if (this.user.role === "ADMIN") {
          this.admin = await get("/admin/dashboard");
        } else {
          const [walletResp, rides] = await Promise.all([
            get("/wallet/me"),
            get(this.user.role === "DRIVER" ? "/rides/driver-history" : "/rides/history", { limit: 5 }),
          ]);
          this.wallet = walletResp.wallet;
          this.rides = rides.rides ?? [];
        }
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <div>
      <div v-if="loading" class="card"><span class="spinner spinner-dark"></span></div>

      <template v-else-if="user.role === 'ADMIN' && admin">
        <div class="grid grid-4">
          <div class="stat">
            <div class="label">Total Users</div>
            <div class="value">{{ admin.users?.total ?? '—' }}</div>
            <div class="hint">{{ admin.users?.newLast7Days ?? 0 }} new this week</div>
          </div>
          <div class="stat">
            <div class="label">Active Rides</div>
            <div class="value">{{ admin.rides?.active ?? '—' }}</div>
            <div class="hint">{{ admin.rides?.byStatus?.COMPLETED ?? 0 }} completed all-time</div>
          </div>
          <div class="stat">
            <div class="label">Drivers Online</div>
            <div class="value">{{ admin.drivers?.onlineNow ?? '—' }}</div>
            <div class="hint">{{ admin.drivers?.byVerificationStatus?.PENDING ?? 0 }} pending review</div>
          </div>
          <div class="stat">
            <div class="label">Revenue (all time)</div>
            <div class="value">{{ admin.revenue?.allTime ?? '—' }}</div>
            <div class="hint">{{ admin.revenue?.last7Days ?? 0 }} last 7 days</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Raw dashboard payload</div>
          <pre class="mono" style="white-space:pre-wrap">{{ JSON.stringify(admin, null, 2) }}</pre>
        </div>
      </template>

      <template v-else>
        <div class="grid grid-3">
          <div class="stat">
            <div class="label">Wallet balance</div>
            <div class="value">{{ wallet?.balance ?? '0.00' }}</div>
            <div class="hint">{{ wallet?.currency ?? 'USD' }}</div>
          </div>
          <div class="stat">
            <div class="label">Role</div>
            <div class="value">{{ user.role }}</div>
          </div>
          <div class="stat">
            <div class="label">Email verified</div>
            <div class="value">{{ user.isEmailVerified ? 'Yes' : 'No' }}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Recent rides</div>
          <div v-if="!rides.length" class="empty-state">
            <div class="icon">🚕</div>
            <div>No rides yet.</div>
          </div>
          <div v-else class="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Fare</th><th>Requested</th></tr></thead>
              <tbody>
                <tr v-for="r in rides" :key="r.id">
                  <td><span class="badge badge-info">{{ r.status }}</span></td>
                  <td>{{ r.fare ?? '—' }}</td>
                  <td>{{ new Date(r.createdAt).toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  `,
};
