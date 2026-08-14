import { get, post } from "../api.js";
import { toast } from "../state.js";

const VEHICLE_TYPES = ["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"];

export default {
  name: "RidesView",
  data() {
    return {
      tab: "request",
      request: {
        pickupAddress: "",
        pickupLat: "37.7749",
        pickupLng: "-122.4194",
        dropoffAddress: "",
        dropoffLat: "37.8044",
        dropoffLng: "-122.2712",
        requestedVehicleType: "SEDAN",
      },
      requesting: false,
      activeRide: null,
      cancelReason: "",
      payMethod: "WALLET",
      couponCode: "",
      paying: false,
      rateValue: 5,
      rateComment: "",
      rating: false,
      payment: null,
      loading: true,
      history: [],
      VEHICLE_TYPES,
    };
  },
  async mounted() {
    await this.loadHistory();
  },
  methods: {
    async submitRequest() {
      this.requesting = true;
      try {
        const body = {
          ...this.request,
          pickupLat: Number(this.request.pickupLat),
          pickupLng: Number(this.request.pickupLng),
          dropoffLat: Number(this.request.dropoffLat),
          dropoffLng: Number(this.request.dropoffLng),
        };
        this.activeRide = await post("/rides", body);
        this.payment = null;
        this.tab = "active";
        toast("Ride requested — waiting for a driver", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.requesting = false;
      }
    },
    async loadActiveRide(id) {
      try {
        this.activeRide = await get(`/rides/${id}`);
        this.tab = "active";
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async refreshActiveRide() {
      if (!this.activeRide) return;
      await this.loadActiveRide(this.activeRide.id);
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
    async payForRide() {
      this.paying = true;
      try {
        const body = { method: this.payMethod };
        if (this.couponCode) body.couponCode = this.couponCode;
        const result = await post(`/rides/${this.activeRide.id}/pay`, body);
        this.payment = result.payment;
        toast("Payment successful", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.paying = false;
      }
    },
    async loadPayment() {
      try {
        this.payment = await get(`/rides/${this.activeRide.id}/payment`);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async submitRating() {
      this.rating = true;
      try {
        await post(`/rides/${this.activeRide.id}/rating`, { value: Number(this.rateValue), comment: this.rateComment || undefined });
        toast("Rating submitted", "success");
        this.rateComment = "";
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.rating = false;
      }
    },
    clearActiveRide() {
      this.activeRide = null;
      this.payment = null;
    },
    async loadHistory() {
      this.loading = true;
      try {
        const data = await get("/rides/history");
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
        <button class="tab" :class="{active: tab==='request'}" @click="tab='request'">Book a Ride</button>
        <button class="tab" :class="{active: tab==='active'}" @click="tab='active'">Active Ride</button>
        <button class="tab" :class="{active: tab==='history'}" @click="tab='history'">History</button>
      </div>

      <div v-if="tab==='request'" class="card" style="max-width:520px">
        <div class="card-title">Book a ride</div>
        <form @submit.prevent="submitRequest">
          <div class="field"><label>Pickup address</label><input v-model="request.pickupAddress" required /></div>
          <div class="field-row">
            <div class="field"><label>Pickup lat</label><input v-model="request.pickupLat" /></div>
            <div class="field"><label>Pickup lng</label><input v-model="request.pickupLng" /></div>
          </div>
          <div class="field"><label>Dropoff address</label><input v-model="request.dropoffAddress" required /></div>
          <div class="field-row">
            <div class="field"><label>Dropoff lat</label><input v-model="request.dropoffLat" /></div>
            <div class="field"><label>Dropoff lng</label><input v-model="request.dropoffLng" /></div>
          </div>
          <div class="field">
            <label>Vehicle type</label>
            <select v-model="request.requestedVehicleType">
              <option v-for="t in VEHICLE_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="btn btn-primary" :disabled="requesting">Request ride</button>
        </form>
      </div>

      <div v-if="tab==='active'">
        <div v-if="!activeRide" class="card">
          <div class="card-title">Load a ride by ID</div>
          <input placeholder="ride id" @keyup.enter="loadActiveRide($event.target.value)" />
          <div class="help">Request a ride from the Book tab, or paste an existing ride ID here.</div>
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
          <div v-if="activeRide.otpCode" class="otp-display">
            <div class="text-sm text-muted">Share this OTP with your driver</div>
            <div class="code">{{ activeRide.otpCode }}</div>
          </div>

          <div class="flex gap-8" style="margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" @click="refreshActiveRide">Refresh status</button>
            <template v-if="['REQUESTED','ACCEPTED'].includes(activeRide.status)">
              <input v-model="cancelReason" placeholder="Cancellation reason (optional)" style="width:220px" />
              <button class="btn btn-danger" @click="cancelRide">Cancel ride</button>
            </template>
            <button class="btn btn-ghost" @click="clearActiveRide">Clear</button>
          </div>

          <template v-if="activeRide.status==='COMPLETED'">
            <div class="divider"></div>
            <div class="card-title">Payment</div>
            <div v-if="payment">
              <div class="badge badge-success">{{ payment.status }}</div>
              <div class="text-sm" style="margin-top:6px">{{ payment.method }} · {{ payment.amount }}</div>
            </div>
            <div v-else class="flex gap-8" style="flex-wrap:wrap">
              <select v-model="payMethod" style="width:auto">
                <option value="WALLET">WALLET</option>
                <option value="CARD">CARD</option>
                <option value="CASH">CASH</option>
              </select>
              <input v-model="couponCode" placeholder="Coupon code (optional)" style="width:160px" />
              <button class="btn btn-primary" :disabled="paying" @click="payForRide">Pay</button>
              <button class="btn btn-ghost btn-sm" @click="loadPayment">Check existing payment</button>
            </div>

            <div class="divider"></div>
            <div class="card-title">Rate your driver</div>
            <div class="flex gap-8" style="align-items:flex-start">
              <select v-model="rateValue" style="width:auto">
                <option v-for="n in [1,2,3,4,5]" :key="n" :value="n">{{ n }} ⭐</option>
              </select>
              <input v-model="rateComment" placeholder="Comment (optional)" style="flex:1" />
              <button class="btn btn-primary" :disabled="rating" @click="submitRating">Submit rating</button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="tab==='history'" class="card">
        <div class="card-title">Ride history</div>
        <div v-if="loading" class="spinner spinner-dark"></div>
        <div v-else-if="!history.length" class="empty-state"><div class="icon">🚕</div>No rides yet.</div>
        <table v-else>
          <thead><tr><th>Status</th><th>Pickup → Dropoff</th><th>Fare</th><th>When</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in history" :key="r.id">
              <td><span class="badge badge-info">{{ r.status }}</span></td>
              <td>{{ r.pickupAddress }} → {{ r.dropoffAddress }}</td>
              <td>{{ r.fare ?? '—' }}</td>
              <td>{{ new Date(r.createdAt).toLocaleString() }}</td>
              <td><button class="btn btn-ghost btn-sm" @click="activeRide = r; payment = null; tab = 'active'">View</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
};
