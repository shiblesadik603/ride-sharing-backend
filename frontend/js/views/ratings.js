import { get } from "../api.js";
import { toast } from "../state.js";

export default {
  name: "RatingsView",
  data() {
    return { loading: true, items: [], avg: null };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await get("/users/me/ratings");
        this.items = data.ratings ?? [];
        this.avg = this.items.length
          ? this.items.reduce((sum, r) => sum + r.value, 0) / this.items.length
          : null;
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <div>
      <div class="stat" style="max-width:200px;margin-bottom:16px" v-if="avg !== null">
        <div class="label">Average rating</div>
        <div class="value">⭐ {{ Number(avg).toFixed(2) }}</div>
      </div>
      <div class="card">
        <div class="card-title">Ratings received</div>
        <div v-if="loading" class="spinner spinner-dark"></div>
        <div v-else-if="!items.length" class="empty-state"><div class="icon">⭐</div>No ratings yet.</div>
        <table v-else>
          <thead><tr><th>Score</th><th>Comment</th><th>From</th><th>When</th></tr></thead>
          <tbody>
            <tr v-for="r in items" :key="r.id">
              <td>{{ '⭐'.repeat(r.value) }}</td>
              <td>{{ r.comment || '—' }}</td>
              <td>{{ r.rater?.firstName ?? '—' }}</td>
              <td>{{ new Date(r.createdAt).toLocaleDateString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
};
