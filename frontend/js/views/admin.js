import { get, post, patch, openFile } from "../api.js";
import { toast } from "../state.js";

export default {
  name: "AdminView",
  data() {
    return {
      tab: "dashboard",
      loading: false,

      dashboard: null,

      users: [],
      userFilter: { role: "", search: "" },

      drivers: [],
      driverFilter: { status: "PENDING" },
      selectedDriver: null,
      selectedDriverDocs: [],

      vehicles: [],

      payments: [],
      refund: { paymentId: "", amount: "", reason: "" },

      coupons: [],
      newCoupon: {
        code: "",
        description: "",
        discountType: "PERCENTAGE",
        discountValue: "",
        maxDiscount: "",
        minRideFare: "",
        usageLimit: "",
        usagePerUser: "1",
        validFrom: "",
        validTo: "",
      },

      walletAdjust: { userId: "", amount: "", reason: "" },

      reportRange: { from: "", to: "" },
      report: null,
    };
  },
  async mounted() {
    await this.loadDashboard();
  },
  methods: {
    async loadDashboard() {
      this.loading = true;
      try {
        this.dashboard = await get("/admin/dashboard");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async loadUsers() {
      this.loading = true;
      try {
        const q = {};
        if (this.userFilter.role) q.role = this.userFilter.role;
        if (this.userFilter.search) q.search = this.userFilter.search;
        const data = await get("/admin/users", q);
        this.users = data.users ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async toggleUserStatus(u) {
      try {
        const updated = await patch(`/admin/users/${u.id}/status`, { isActive: !u.isActive });
        Object.assign(u, updated);
        toast("User status updated", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },

    async loadDrivers() {
      this.loading = true;
      try {
        const q = {};
        if (this.driverFilter.status) q.verificationStatus = this.driverFilter.status;
        const data = await get("/admin/drivers", q);
        this.drivers = data.drivers ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async viewDriver(d) {
      try {
        this.selectedDriver = await get(`/admin/drivers/${d.id}`);
        this.selectedDriverDocs = (this.selectedDriver.vehicles ?? []).flatMap((v) => v.documents ?? []);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async reviewDriver(status) {
      try {
        await patch(`/admin/drivers/${this.selectedDriver.id}/verification`, { verificationStatus: status });
        toast(`Driver ${status.toLowerCase()}`, "success");
        this.selectedDriver.verificationStatus = status;
        await this.loadDrivers();
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async reviewVehicle(vehicleId, status) {
      try {
        await patch(`/admin/vehicles/${vehicleId}/verification`, { isVerified: status === "APPROVED" });
        toast(`Vehicle ${status.toLowerCase()}`, "success");
        await this.viewDriver(this.selectedDriver);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async reviewDocument(docId, status) {
      try {
        await patch(`/admin/vehicle-documents/${docId}/review`, { status });
        toast(`Document ${status.toLowerCase()}`, "success");
        await this.viewDriver(this.selectedDriver);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async viewAdminDoc(docId) {
      try {
        await openFile(`/admin/vehicle-documents/${docId}/file`);
      } catch (e) {
        toast(e.message, "error");
      }
    },

    async loadPayments() {
      this.loading = true;
      try {
        const data = await get("/admin/payments");
        this.payments = data.payments ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async submitRefund() {
      try {
        await post(`/admin/payments/${this.refund.paymentId}/refund`, {
          amount: this.refund.amount ? Number(this.refund.amount) : undefined,
          reason: this.refund.reason,
        });
        toast("Refund processed", "success");
        this.refund = { paymentId: "", amount: "", reason: "" };
        await this.loadPayments();
      } catch (e) {
        toast(e.message, "error");
      }
    },

    async loadCoupons() {
      this.loading = true;
      try {
        const data = await get("/admin/coupons");
        this.coupons = data.coupons ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async createCoupon() {
      try {
        const body = {
          code: this.newCoupon.code.toUpperCase(),
          discountType: this.newCoupon.discountType,
          discountValue: Number(this.newCoupon.discountValue),
          usagePerUser: Number(this.newCoupon.usagePerUser || 1),
          validFrom: new Date(this.newCoupon.validFrom).toISOString(),
          validTo: new Date(this.newCoupon.validTo).toISOString(),
        };
        if (this.newCoupon.description) body.description = this.newCoupon.description;
        if (this.newCoupon.maxDiscount) body.maxDiscount = Number(this.newCoupon.maxDiscount);
        if (this.newCoupon.minRideFare) body.minRideFare = Number(this.newCoupon.minRideFare);
        if (this.newCoupon.usageLimit) body.usageLimit = Number(this.newCoupon.usageLimit);
        const created = await post("/admin/coupons", body);
        this.coupons.push(created);
        this.newCoupon = {
          code: "",
          description: "",
          discountType: "PERCENTAGE",
          discountValue: "",
          maxDiscount: "",
          minRideFare: "",
          usageLimit: "",
          usagePerUser: "1",
          validFrom: "",
          validTo: "",
        };
        toast("Coupon created", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async toggleCoupon(c) {
      try {
        const updated = await patch(`/admin/coupons/${c.id}`, { isActive: !c.isActive });
        Object.assign(c, updated);
      } catch (e) {
        toast(e.message, "error");
      }
    },

    async submitWalletAdjust() {
      try {
        await post(`/admin/wallets/${this.walletAdjust.userId}/adjust`, {
          amount: Number(this.walletAdjust.amount),
          reason: this.walletAdjust.reason,
        });
        toast("Wallet adjusted", "success");
        this.walletAdjust = { userId: "", amount: "", reason: "" };
      } catch (e) {
        toast(e.message, "error");
      }
    },

    async loadReport() {
      try {
        const q = {};
        if (this.reportRange.from) q.from = this.reportRange.from;
        if (this.reportRange.to) q.to = this.reportRange.to;
        this.report = await get("/admin/reports/summary", q);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async sendReport() {
      try {
        const q = {};
        if (this.reportRange.from) q.from = this.reportRange.from;
        if (this.reportRange.to) q.to = this.reportRange.to;
        const path = "/admin/reports/summary/send" + (Object.keys(q).length ? `?${new URLSearchParams(q)}` : "");
        await post(path);
        toast("Report emailed — check the backend console", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
  },
  watch: {
    tab(t) {
      if (t === "users" && !this.users.length) this.loadUsers();
      if (t === "drivers" && !this.drivers.length) this.loadDrivers();
      if (t === "payments" && !this.payments.length) this.loadPayments();
      if (t === "coupons" && !this.coupons.length) this.loadCoupons();
    },
  },
  template: `
    <div>
      <div class="tabs">
        <button class="tab" :class="{active: tab==='dashboard'}" @click="tab='dashboard'">Dashboard</button>
        <button class="tab" :class="{active: tab==='users'}" @click="tab='users'">Users</button>
        <button class="tab" :class="{active: tab==='drivers'}" @click="tab='drivers'">Driver Verification</button>
        <button class="tab" :class="{active: tab==='payments'}" @click="tab='payments'">Payments</button>
        <button class="tab" :class="{active: tab==='coupons'}" @click="tab='coupons'">Coupons</button>
        <button class="tab" :class="{active: tab==='wallet'}" @click="tab='wallet'">Wallet Adjust</button>
        <button class="tab" :class="{active: tab==='reports'}" @click="tab='reports'">Reports</button>
      </div>

      <div v-if="tab==='dashboard'" class="card">
        <div class="card-title">
          Platform overview
          <button class="btn btn-ghost btn-sm" @click="loadDashboard">Refresh</button>
        </div>
        <div v-if="loading" class="spinner spinner-dark"></div>
        <pre v-else class="mono" style="white-space:pre-wrap">{{ JSON.stringify(dashboard, null, 2) }}</pre>
      </div>

      <div v-if="tab==='users'">
        <div class="card">
          <div class="flex gap-8">
            <select v-model="userFilter.role" style="width:auto">
              <option value="">All roles</option>
              <option value="PASSENGER">PASSENGER</option>
              <option value="DRIVER">DRIVER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <input v-model="userFilter.search" placeholder="Search by name/email" style="flex:1" />
            <button class="btn btn-primary" @click="loadUsers">Search</button>
          </div>
        </div>
        <div class="card">
          <div v-if="loading" class="spinner spinner-dark"></div>
          <div v-else-if="!users.length" class="empty-state"><div class="icon">🧑‍🤝‍🧑</div>No users loaded.</div>
          <table v-else>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>{{ u.firstName }} {{ u.lastName }}</td>
                <td>{{ u.email }}</td>
                <td><span class="badge badge-neutral">{{ u.role }}</span></td>
                <td><span class="badge" :class="u.isActive ? 'badge-success' : 'badge-danger'">{{ u.isActive ? 'Active' : 'Suspended' }}</span></td>
                <td><button class="btn btn-outline btn-sm" @click="toggleUserStatus(u)">{{ u.isActive ? 'Suspend' : 'Reactivate' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="tab==='drivers'">
        <div class="card">
          <div class="flex gap-8">
            <select v-model="driverFilter.status" style="width:auto">
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="">All</option>
            </select>
            <button class="btn btn-primary" @click="loadDrivers">Load</button>
          </div>
        </div>
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">Drivers</div>
            <div v-if="loading" class="spinner spinner-dark"></div>
            <div v-else-if="!drivers.length" class="empty-state"><div class="icon">🪪</div>No drivers found.</div>
            <table v-else>
              <tbody>
                <tr v-for="d in drivers" :key="d.id" style="cursor:pointer" @click="viewDriver(d)">
                  <td>{{ d.user?.firstName }} {{ d.user?.lastName }}</td>
                  <td><span class="badge badge-warning">{{ d.verificationStatus }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="card" v-if="selectedDriver">
            <div class="card-title">{{ selectedDriver.user?.firstName }} {{ selectedDriver.user?.lastName }}</div>
            <div class="text-sm text-muted">License {{ selectedDriver.licenseNumber }} · expires {{ new Date(selectedDriver.licenseExpiry).toLocaleDateString() }}</div>
            <div class="flex gap-8" style="margin-top:12px">
              <button class="btn btn-success btn-sm" @click="reviewDriver('APPROVED')">Approve driver</button>
              <button class="btn btn-danger btn-sm" @click="reviewDriver('REJECTED')">Reject driver</button>
              <button class="btn btn-outline btn-sm" @click="reviewDriver('SUSPENDED')">Suspend</button>
            </div>

            <div class="divider"></div>
            <div class="card-title" style="font-size:13px">Vehicles</div>
            <div v-for="v in selectedDriver.vehicles ?? []" :key="v.id" style="margin-bottom:10px;padding:10px;border:1px solid var(--ink-100);border-radius:8px">
              <div class="flex-between">
                <div>{{ v.make }} {{ v.model }} · {{ v.plateNumber }}</div>
                <span class="badge" :class="v.isVerified ? 'badge-success' : 'badge-warning'">{{ v.isVerified ? 'Verified' : 'Pending' }}</span>
              </div>
              <div class="flex gap-8" style="margin-top:6px">
                <button class="btn btn-success btn-sm" @click="reviewVehicle(v.id, 'APPROVED')">Approve vehicle</button>
                <button class="btn btn-danger btn-sm" @click="reviewVehicle(v.id, 'REJECTED')">Reject vehicle</button>
              </div>
              <div v-for="doc in v.documents ?? []" :key="doc.id" class="flex-between" style="margin-top:8px;font-size:12.5px">
                <span>{{ doc.type }} — {{ doc.status }}</span>
                <span class="flex gap-8">
                  <button class="btn btn-ghost btn-sm" @click="viewAdminDoc(doc.id)">View</button>
                  <button class="btn btn-success btn-sm" @click="reviewDocument(doc.id, 'APPROVED')">Approve</button>
                  <button class="btn btn-danger btn-sm" @click="reviewDocument(doc.id, 'REJECTED')">Reject</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="tab==='payments'">
        <div class="card">
          <div class="card-title">
            All payments
            <button class="btn btn-ghost btn-sm" @click="loadPayments">Refresh</button>
          </div>
          <div v-if="loading" class="spinner spinner-dark"></div>
          <div v-else-if="!payments.length" class="empty-state"><div class="icon">💰</div>No payments yet.</div>
          <table v-else>
            <thead><tr><th>ID</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="p in payments" :key="p.id">
                <td class="mono">{{ p.id }}</td>
                <td>{{ p.method }}</td>
                <td>{{ p.amount }}</td>
                <td><span class="badge badge-info">{{ p.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-title">Issue a refund</div>
          <div class="field"><label>Payment ID</label><input v-model="refund.paymentId" /></div>
          <div class="field-row">
            <div class="field"><label>Amount (blank = full)</label><input v-model="refund.amount" type="number" /></div>
            <div class="field"><label>Reason</label><input v-model="refund.reason" required /></div>
          </div>
          <button class="btn btn-danger" @click="submitRefund">Refund</button>
        </div>
      </div>

      <div v-if="tab==='coupons'">
        <div class="card">
          <div class="card-title">Create coupon</div>
          <div class="field-row">
            <div class="field"><label>Code</label><input v-model="newCoupon.code" placeholder="WELCOME10" /></div>
            <div class="field">
              <label>Type</label>
              <select v-model="newCoupon.discountType"><option value="PERCENTAGE">PERCENTAGE</option><option value="FIXED">FIXED</option></select>
            </div>
          </div>
          <div class="field"><label>Description (optional)</label><input v-model="newCoupon.description" /></div>
          <div class="field-row">
            <div class="field"><label>Discount value</label><input v-model="newCoupon.discountValue" type="number" /></div>
            <div class="field"><label>Usage limit (optional)</label><input v-model="newCoupon.usageLimit" type="number" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Max discount (optional)</label><input v-model="newCoupon.maxDiscount" type="number" /></div>
            <div class="field"><label>Min ride fare (optional)</label><input v-model="newCoupon.minRideFare" type="number" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Valid from</label><input v-model="newCoupon.validFrom" type="date" required /></div>
            <div class="field"><label>Valid to</label><input v-model="newCoupon.validTo" type="date" required /></div>
          </div>
          <button class="btn btn-primary" @click="createCoupon">Create</button>
        </div>
        <div class="card">
          <div class="card-title">
            Coupons
            <button class="btn btn-ghost btn-sm" @click="loadCoupons">Refresh</button>
          </div>
          <div v-if="!coupons.length" class="empty-state"><div class="icon">🏷️</div>No coupons yet.</div>
          <table v-else>
            <thead><tr><th>Code</th><th>Discount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in coupons" :key="c.id">
                <td class="mono">{{ c.code }}</td>
                <td>{{ c.discountValue }} {{ c.discountType === 'PERCENTAGE' ? '%' : '' }}</td>
                <td><span class="badge" :class="c.isActive ? 'badge-success' : 'badge-neutral'">{{ c.isActive ? 'Active' : 'Inactive' }}</span></td>
                <td><button class="btn btn-outline btn-sm" @click="toggleCoupon(c)">{{ c.isActive ? 'Deactivate' : 'Activate' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="tab==='wallet'" class="card" style="max-width:480px">
        <div class="card-title">Manually adjust a user's wallet</div>
        <div class="field"><label>User ID</label><input v-model="walletAdjust.userId" /></div>
        <div class="field"><label>Amount (negative to debit)</label><input v-model="walletAdjust.amount" type="number" /></div>
        <div class="field"><label>Reason</label><input v-model="walletAdjust.reason" /></div>
        <button class="btn btn-primary" @click="submitWalletAdjust">Adjust</button>
      </div>

      <div v-if="tab==='reports'">
        <div class="card">
          <div class="card-title">Summary report</div>
          <div class="field-row">
            <div class="field"><label>From</label><input v-model="reportRange.from" type="date" /></div>
            <div class="field"><label>To</label><input v-model="reportRange.to" type="date" /></div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-primary" @click="loadReport">Load summary</button>
            <button class="btn btn-outline" @click="sendReport">Email summary</button>
          </div>
          <pre v-if="report" class="mono" style="white-space:pre-wrap;margin-top:14px">{{ JSON.stringify(report, null, 2) }}</pre>
        </div>
      </div>
    </div>
  `,
};
