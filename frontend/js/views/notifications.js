import { get, patch } from "../api.js";
import { toast } from "../state.js";

export default {
  name: "NotificationsView",
  data() {
    return { loading: true, items: [] };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await get("/users/me/notifications");
        this.items = data.notifications ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async markRead(n) {
      try {
        await patch(`/users/me/notifications/${n.id}/read`);
        n.readAt = new Date().toISOString();
        toast("Marked as read", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
  },
  template: `
    <div class="card">
      <div class="card-title">
        Notifications
        <button class="btn btn-ghost btn-sm" @click="load">Refresh</button>
      </div>
      <div v-if="loading" class="spinner spinner-dark"></div>
      <div v-else-if="!items.length" class="empty-state"><div class="icon">🔔</div>Nothing here yet.</div>
      <table v-else>
        <thead><tr><th>Channel</th><th>Message</th><th>Status</th><th>When</th><th></th></tr></thead>
        <tbody>
          <tr v-for="n in items" :key="n.id">
            <td><span class="badge badge-neutral">{{ n.channel }}</span></td>
            <td>{{ n.message ?? n.title ?? n.type }}</td>
            <td>
              <span class="badge" :class="n.readAt ? 'badge-success' : 'badge-warning'">{{ n.readAt ? 'Read' : 'Unread' }}</span>
            </td>
            <td>{{ new Date(n.createdAt).toLocaleString() }}</td>
            <td><button v-if="!n.readAt" class="btn btn-outline btn-sm" @click="markRead(n)">Mark read</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
};
