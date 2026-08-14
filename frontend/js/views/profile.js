import { get, post, patch, del } from "../api.js";
import { currentUser, state, toast } from "../state.js";
import { saveSession, currentSession } from "../state.js";

export default {
  name: "ProfileView",
  data() {
    return {
      tab: "info",
      loading: true,
      form: { firstName: "", lastName: "", phone: "", avatarUrl: "" },
      pw: { currentPassword: "", newPassword: "" },
      becomeDriver: { licenseNumber: "", licenseExpiry: "" },
      locations: [],
      newLocation: { label: "", address: "", lat: "", lng: "" },
      favorites: [],
      newFavoriteId: "",
      saving: false,
    };
  },
  computed: {
    user() {
      return currentUser();
    },
  },
  async mounted() {
    await this.loadAll();
  },
  methods: {
    async loadAll() {
      this.loading = true;
      try {
        const me = await get("/users/me");
        this.form = {
          firstName: me.firstName ?? "",
          lastName: me.lastName ?? "",
          phone: me.phone ?? "",
          avatarUrl: me.avatarUrl ?? "",
        };
        const [locations, favorites] = await Promise.all([
          get("/users/me/saved-locations"),
          get("/users/me/favorite-drivers"),
        ]);
        this.locations = locations.items ?? locations ?? [];
        this.favorites = favorites.items ?? favorites ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async saveProfile() {
      this.saving = true;
      try {
        const body = { ...this.form };
        if (!body.phone) delete body.phone;
        if (!body.avatarUrl) delete body.avatarUrl;
        const updated = await patch("/users/me", body);
        const session = currentSession();
        saveSession({ user: { ...session.user, ...updated }, accessToken: session.accessToken, refreshToken: session.refreshToken });
        toast("Profile updated", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.saving = false;
      }
    },
    async changePassword() {
      this.saving = true;
      try {
        await post("/users/me/change-password", this.pw);
        this.pw = { currentPassword: "", newPassword: "" };
        toast("Password changed", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.saving = false;
      }
    },
    async submitBecomeDriver() {
      this.saving = true;
      try {
        await post("/users/me/become-driver", this.becomeDriver);
        toast("You're now registered as a driver — log out and back in to refresh your role", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.saving = false;
      }
    },
    async addLocation() {
      try {
        const body = {
          label: this.newLocation.label,
          address: this.newLocation.address,
          lat: Number(this.newLocation.lat),
          lng: Number(this.newLocation.lng),
        };
        const created = await post("/users/me/saved-locations", body);
        this.locations.push(created);
        this.newLocation = { label: "", address: "", lat: "", lng: "" };
        toast("Location saved", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async removeLocation(id) {
      try {
        await del(`/users/me/saved-locations/${id}`);
        this.locations = this.locations.filter((l) => l.id !== id);
        toast("Location removed", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async addFavorite() {
      try {
        await post("/users/me/favorite-drivers", { driverId: this.newFavoriteId });
        const favorites = await get("/users/me/favorite-drivers");
        this.favorites = favorites.items ?? favorites ?? [];
        this.newFavoriteId = "";
        toast("Driver favorited", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async removeFavorite(driverId) {
      try {
        await del(`/users/me/favorite-drivers/${driverId}`);
        this.favorites = this.favorites.filter((f) => (f.driverId ?? f.id) !== driverId);
        toast("Removed from favorites", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
  },
  template: `
    <div>
      <div class="tabs">
        <button class="tab" :class="{active: tab==='info'}" @click="tab='info'">Profile</button>
        <button class="tab" :class="{active: tab==='security'}" @click="tab='security'">Security</button>
        <button class="tab" v-if="user.role==='PASSENGER'" :class="{active: tab==='driver'}" @click="tab='driver'">Become a Driver</button>
        <button class="tab" :class="{active: tab==='locations'}" @click="tab='locations'">Saved Locations</button>
        <button class="tab" v-if="user.role==='PASSENGER'" :class="{active: tab==='favorites'}" @click="tab='favorites'">Favorite Drivers</button>
      </div>

      <div v-if="loading" class="card"><span class="spinner spinner-dark"></span></div>

      <template v-else>
        <div v-if="tab==='info'" class="card" style="max-width:480px">
          <div class="card-title">Profile info</div>
          <form @submit.prevent="saveProfile">
            <div class="field-row">
              <div class="field"><label>First name</label><input v-model="form.firstName" required /></div>
              <div class="field"><label>Last name</label><input v-model="form.lastName" required /></div>
            </div>
            <div class="field"><label>Phone (E.164)</label><input v-model="form.phone" placeholder="+14155552671" /></div>
            <div class="field"><label>Avatar URL</label><input v-model="form.avatarUrl" placeholder="https://..." /></div>
            <button class="btn btn-primary" :disabled="saving">Save changes</button>
          </form>
        </div>

        <div v-if="tab==='security'" class="card" style="max-width:480px">
          <div class="card-title">Change password</div>
          <form @submit.prevent="changePassword">
            <div class="field"><label>Current password</label><input v-model="pw.currentPassword" type="password" required /></div>
            <div class="field"><label>New password</label><input v-model="pw.newPassword" type="password" required /></div>
            <button class="btn btn-primary" :disabled="saving">Change password</button>
          </form>
        </div>

        <div v-if="tab==='driver'" class="card" style="max-width:480px">
          <div class="card-title">Register as a driver</div>
          <form @submit.prevent="submitBecomeDriver">
            <div class="field"><label>License number</label><input v-model="becomeDriver.licenseNumber" required /></div>
            <div class="field"><label>License expiry</label><input v-model="becomeDriver.licenseExpiry" type="date" required /></div>
            <button class="btn btn-primary" :disabled="saving">Submit</button>
          </form>
        </div>

        <div v-if="tab==='locations'">
          <div class="card">
            <div class="card-title">Add a saved location</div>
            <div class="field-row">
              <div class="field"><label>Label</label><input v-model="newLocation.label" placeholder="Home" /></div>
              <div class="field"><label>Address</label><input v-model="newLocation.address" placeholder="123 Main St" /></div>
            </div>
            <div class="field-row">
              <div class="field"><label>Lat</label><input v-model="newLocation.lat" placeholder="37.7749" /></div>
              <div class="field"><label>Lng</label><input v-model="newLocation.lng" placeholder="-122.4194" /></div>
            </div>
            <button class="btn btn-primary" @click="addLocation">Add location</button>
          </div>
          <div class="card">
            <div class="card-title">Your locations</div>
            <div v-if="!locations.length" class="empty-state"><div class="icon">📍</div>No saved locations.</div>
            <table v-else>
              <thead><tr><th>Label</th><th>Address</th><th></th></tr></thead>
              <tbody>
                <tr v-for="l in locations" :key="l.id">
                  <td>{{ l.label }}</td>
                  <td>{{ l.address }}</td>
                  <td><button class="btn btn-danger btn-sm" @click="removeLocation(l.id)">Remove</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="tab==='favorites'">
          <div class="card">
            <div class="card-title">Add favorite driver</div>
            <div class="flex gap-8">
              <input v-model="newFavoriteId" placeholder="Driver ID" />
              <button class="btn btn-primary" @click="addFavorite">Add</button>
            </div>
            <div class="help">Find a driver ID from a completed ride's payment/rating screen.</div>
          </div>
          <div class="card">
            <div class="card-title">Favorites</div>
            <div v-if="!favorites.length" class="empty-state"><div class="icon">⭐</div>No favorite drivers yet.</div>
            <table v-else>
              <tbody>
                <tr v-for="f in favorites" :key="f.driverId ?? f.id">
                  <td>{{ f.driver?.user?.firstName ?? f.driverId ?? f.id }}</td>
                  <td><button class="btn btn-danger btn-sm" @click="removeFavorite(f.driverId ?? f.id)">Remove</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  `,
};
