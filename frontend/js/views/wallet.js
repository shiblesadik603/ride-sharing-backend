import { get, post } from "../api.js";
import { toast } from "../state.js";

export default {
  name: "WalletView",
  data() {
    return { loading: true, wallet: null, transactions: [], topup: { amount: "" }, saving: false };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await get("/wallet/me");
        this.wallet = data.wallet;
        this.transactions = data.transactions ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async doTopup() {
      this.saving = true;
      try {
        await post("/wallet/me/topup", { amount: Number(this.topup.amount) });
        this.topup.amount = "";
        toast("Wallet topped up", "success");
        await this.load();
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.saving = false;
      }
    },
  },
  template: `
    <div>
      <div v-if="loading" class="card"><span class="spinner spinner-dark"></span></div>
      <template v-else>
        <div class="grid grid-2">
          <div class="stat">
            <div class="label">Balance</div>
            <div class="value">{{ wallet?.balance ?? '0.00' }} {{ wallet?.currency ?? 'USD' }}</div>
          </div>
          <div class="card">
            <div class="card-title">Top up wallet</div>
            <form @submit.prevent="doTopup" class="flex gap-8">
              <input v-model="topup.amount" type="number" min="1" step="0.01" placeholder="Amount" required style="flex:1" />
              <button class="btn btn-primary" :disabled="saving">Top up</button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Transaction history</div>
          <div v-if="!transactions.length" class="empty-state"><div class="icon">💳</div>No transactions yet.</div>
          <table v-else>
            <thead><tr><th>Type</th><th>Reason</th><th>Amount</th><th>When</th></tr></thead>
            <tbody>
              <tr v-for="t in transactions" :key="t.id">
                <td><span class="badge" :class="t.type === 'CREDIT' ? 'badge-success' : 'badge-danger'">{{ t.type }}</span></td>
                <td>{{ t.reason }}</td>
                <td>{{ t.amount }}</td>
                <td>{{ new Date(t.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  `,
};
