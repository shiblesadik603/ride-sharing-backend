import { get, post } from "../api.js";
import { toast } from "../state.js";

export default {
  name: "DriverView",
  data() {
    return {
      tab: "console",
      loading: true,
      driverStatus: null,
      loc: { lat: "37.7749", lng: "-122.4194" },
      nearbyQuery: { lat: "37.7749", lng: "-122.4194", radiusKm: "5" },
      nearby: [],
      activeRide: null,
      otp: "",
      cancelReason: "",
      history: [],
      busy: false,
    };
  },
  async mounted() {
    await this.loadHistory();
  },
  methods: {
    async goOnline() {
      this.busy = true;
      try {
        const body = { lat: Number(this.loc.lat), lng: Number(this.loc.lng) };
        this.driverStatus = await post("/drivers/me/online", body);
        toast("You're online", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.busy = false;
      }
    },
    async goOffline() {
      this.busy = true;
      try {
        this.driverStatus = await post("/drivers/me/offline");
        toast("You're offline", "info");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.busy = false;
      }
    },
    async pingLocation() {
      try {
        await post("/drivers/me/location", { lat: Number(this.loc.lat), lng: Number(this.loc.lng) });
        toast("Location pinged", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async loadNearby() {
      this.busy = true;
      try {
        const data = await get("/rides/nearby", {
          lat: this.nearbyQuery.lat,
          lng: this.nearbyQuery.lng,
          radiusKm: this.nearbyQuery.radiusKm,
        });
        this.nearby = data.items ?? data ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.busy = false;
      }
    },
    async acceptRide(ride) {
      try {
        this.activeRide = await post(`/rides/${ride.id}/accept`);
        this.nearby = this.nearby.filter((r) => r.id !== ride.id);
        this.tab = "active";
        toast("Ride accepted", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async rejectRide(ride) {
      try {
        await post(`/rides/${ride.id}/reject`);
        this.nearby = this.nearby.filter((r) => r.id !== ride.id);
        toast("Ride rejected", "info");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async loadActiveRide(id) {
      try {
        this.activeRide = await get(`/rides/${id}`);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async markArrived() {
      try {
        this.activeRide = await post(`/rides/${this.activeRide.id}/arrived`);
        toast("Marked arrived", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async startRide() {
      try {
        this.activeRide = await post(`/rides/${this.activeRide.id}/start`, { otpCode: this.otp });
        this.otp = "";
        toast("Ride started", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async completeRide() {
      try {
        this.activeRide = await post(`/rides/${this.activeRide.id}/complete`);
        toast("Ride completed", "success");
        await this.loadHistory();
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async cancelRide() {
      try {
        this.activeRide = await post(`/rides/${this.activeRide.id}/cancel`, { reason: this.cancelReason || undefined });
        this.cancelReason = "";
        toast("Ride cancelled", "info");
        await this.loadHistory();
      } catch (e) {
        toast(e.message, "error");
      }
    },
    clearActiveRide() {
      this.activeRide = null;
    },
    async loadHistory() {
      this.loading = true;
      try {
        const data = await get("/rides/driver-history");
        this.history = data.rides ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <div>
      <div class="tabs">
        <button class="tab" :class="{active: tab==='console'}" @click="tab='console'">Console</button>
        <button class="tab" :class="{active: tab==='active'}" @click="tab='active'">Active Ride</button>
        <button class="tab" :class="{active: tab==='history'}" @click="tab='history'">History</button>
      </div>

      <div v-if="tab==='console'">
        <div class="card">
          <div class="card-title">Online status</div>
          <div class="field-row">
            <div class="field"><label>Lat</label><input v-model="loc.lat" /></div>
            <div class="field"><label>Lng</label><input v-model="loc.lng" /></div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-success" :disabled="busy" @click="goOnline">Go online</button>
            <button class="btn btn-outline" :disabled="busy" @click="goOffline">Go offline</button>
            <button class="btn btn-outline" @click="pingLocation">Ping location</button>
          </div>
          <div v-if="driverStatus" class="help" style="margin-top:10px">{{ JSON.stringify(driverStatus) }}</div>
        </div>

        <div class="card">
          <div class="card-title">Nearby ride requests</div>
          <div class="field-row">
            <div class="field"><label>Lat</label><input v-model="nearbyQuery.lat" /></div>
            <div class="field"><label>Lng</label><input v-model="nearbyQuery.lng" /></div>
            <div class="field"><label>Radius (km)</label><input v-model="nearbyQuery.radiusKm" /></div>
          </div>
          <button class="btn btn-primary" :disabled="busy" @click="loadNearby">Search nearby</button>

          <div v-if="!nearby.length" class="empty-state" style="margin-top:16px"><div class="icon">🧭</div>No nearby requests found.</div>
          <table v-else style="margin-top:16px">
            <thead><tr><th>Pickup</th><th>Dropoff</th><th>Vehicle</th><th></th></tr></thead>
            <tbody>
              <tr v-for="r in nearby" :key="r.id">
                <td>{{ r.pickupAddress }}</td>
                <td>{{ r.dropoffAddress }}</td>
                <td>{{ r.requestedVehicleType }}</td>
                <td class="flex gap-8">
                  <button class="btn btn-success btn-sm" @click="acceptRide(r)">Accept</button>
                  <button class="btn btn-danger btn-sm" @click="rejectRide(r)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="tab==='active'">
        <div v-if="!activeRide" class="card">
          <div class="card-title">Load a ride by ID</div>
          <div class="flex gap-8">
            <input placeholder="ride id" @keyup.enter="loadActiveRide($event.target.value)" />
          </div>
          <div class="help">Accept a ride from the Console tab, or paste an existing ride ID here.</div>
        </div>
        <div v-else class="card">
          <div class="card-title">
            Ride {{ activeRide.id }}
            <span class="badge badge-info">{{ activeRide.status }}</span>
          </div>
          <div class="map-placeholder">
            <div class="route-line"><span class="route-dot pickup"></span> {{ activeRide.pickupAddress }}</div>
            <div class="route-line"><span class="route-dot dropoff"></span> {{ activeRide.dropoffAddress }}</div>
          </div>

          <div class="flex gap-8" style="margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-outline" v-if="activeRide.status==='ACCEPTED'" @click="markArrived">Mark arrived</button>
            <template v-if="activeRide.status==='ARRIVED'">
              <input v-model="otp" placeholder="4-digit OTP from passenger" style="width:160px" />
              <button class="btn btn-primary" @click="startRide">Start ride</button>
            </template>
            <button class="btn btn-success" v-if="activeRide.status==='IN_PROGRESS'" @click="completeRide">Complete ride</button>
            <template v-if="['ACCEPTED','ARRIVED'].includes(activeRide.status)">
              <input v-model="cancelReason" placeholder="Cancellation reason (optional)" style="width:220px" />
              <button class="btn btn-danger" @click="cancelRide">Cancel</button>
            </template>
            <button class="btn btn-ghost" @click="clearActiveRide">Clear</button>
          </div>
        </div>
      </div>

      <div v-if="tab==='history'" class="card">
        <div class="card-title">Ride history</div>
        <div v-if="loading" class="spinner spinner-dark"></div>
        <div v-else-if="!history.length" class="empty-state"><div class="icon">🚕</div>No completed rides yet.</div>
        <table v-else>
          <thead><tr><th>Status</th><th>Pickup → Dropoff</th><th>Fare</th><th>When</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in history" :key="r.id">
              <td><span class="badge badge-info">{{ r.status }}</span></td>
              <td>{{ r.pickupAddress }} → {{ r.dropoffAddress }}</td>
              <td>{{ r.fare ?? '—' }}</td>
              <td>{{ new Date(r.createdAt).toLocaleString() }}</td>
              <td><button class="btn btn-ghost btn-sm" @click="activeRide = r; tab = 'active'">View</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
};
