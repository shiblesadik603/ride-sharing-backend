import { get, post, patch, del, postForm, openFile } from "../api.js";
import { toast } from "../state.js";

const VEHICLE_TYPES = ["BIKE", "AUTO", "SEDAN", "SUV", "HATCHBACK"];
const DOC_TYPES = ["REGISTRATION", "INSURANCE", "PERMIT", "POLLUTION_CERTIFICATE"];

export default {
  name: "VehiclesView",
  data() {
    return {
      loading: true,
      vehicles: [],
      form: { type: "SEDAN", make: "", model: "", year: "", color: "", plateNumber: "", capacity: "" },
      creating: false,
      expandedId: null,
      documents: {},
      docType: DOC_TYPES[0],
      docFile: null,
      VEHICLE_TYPES,
      DOC_TYPES,
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await get("/vehicles");
        this.vehicles = data.items ?? data ?? [];
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.loading = false;
      }
    },
    async createVehicle() {
      this.creating = true;
      try {
        const body = { ...this.form, year: Number(this.form.year), capacity: Number(this.form.capacity) };
        const v = await post("/vehicles", body);
        this.vehicles.push(v);
        this.form = { type: "SEDAN", make: "", model: "", year: "", color: "", plateNumber: "", capacity: "" };
        toast("Vehicle added", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        this.creating = false;
      }
    },
    async removeVehicle(id) {
      try {
        await del(`/vehicles/${id}`);
        this.vehicles = this.vehicles.filter((v) => v.id !== id);
        toast("Vehicle removed", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async toggleActive(v) {
      try {
        const updated = await patch(`/vehicles/${v.id}`, { isActive: !v.isActive });
        Object.assign(v, updated);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async expand(v) {
      this.expandedId = this.expandedId === v.id ? null : v.id;
      if (this.expandedId && !this.documents[v.id]) {
        try {
          const docs = await get(`/vehicles/${v.id}/documents`);
          this.documents[v.id] = docs.items ?? docs ?? [];
        } catch (e) {
          toast(e.message, "error");
        }
      }
    },
    onFileChange(e) {
      this.docFile = e.target.files[0] ?? null;
    },
    async uploadDoc(vehicleId) {
      if (!this.docFile) {
        toast("Choose a file first", "error");
        return;
      }
      try {
        const fd = new FormData();
        fd.append("document", this.docFile);
        fd.append("type", this.docType);
        const doc = await postForm(`/vehicles/${vehicleId}/documents`, fd);
        this.documents[vehicleId] = [...(this.documents[vehicleId] ?? []), doc];
        this.docFile = null;
        toast("Document uploaded", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async removeDoc(vehicleId, docId) {
      try {
        await del(`/vehicles/${vehicleId}/documents/${docId}`);
        this.documents[vehicleId] = this.documents[vehicleId].filter((d) => d.id !== docId);
        toast("Document removed", "success");
      } catch (e) {
        toast(e.message, "error");
      }
    },
    async viewDoc(vehicleId, docId) {
      try {
        await openFile(`/vehicles/${vehicleId}/documents/${docId}/file`);
      } catch (e) {
        toast(e.message, "error");
      }
    },
  },
  template: `
    <div>
      <div class="card">
        <div class="card-title">Add a vehicle</div>
        <form @submit.prevent="createVehicle">
          <div class="field-row">
            <div class="field">
              <label>Type</label>
              <select v-model="form.type"><option v-for="t in VEHICLE_TYPES" :key="t" :value="t">{{ t }}</option></select>
            </div>
            <div class="field"><label>Capacity</label><input v-model="form.capacity" type="number" min="1" required /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Make</label><input v-model="form.make" required /></div>
            <div class="field"><label>Model</label><input v-model="form.model" required /></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Year</label><input v-model="form.year" type="number" required /></div>
            <div class="field"><label>Color</label><input v-model="form.color" required /></div>
          </div>
          <div class="field"><label>Plate number</label><input v-model="form.plateNumber" required /></div>
          <button class="btn btn-primary" :disabled="creating">Add vehicle</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Your vehicles</div>
        <div v-if="loading" class="spinner spinner-dark"></div>
        <div v-else-if="!vehicles.length" class="empty-state"><div class="icon">🚙</div>No vehicles yet.</div>
        <div v-else v-for="v in vehicles" :key="v.id" style="margin-bottom:10px;border:1px solid var(--ink-100);border-radius:var(--radius-md);padding:14px">
          <div class="flex-between">
            <div>
              <strong>{{ v.make }} {{ v.model }} ({{ v.year }})</strong>
              <span class="badge badge-neutral" style="margin-left:8px">{{ v.type }}</span>
              <span class="badge" :class="v.isVerified ? 'badge-success' : 'badge-warning'" style="margin-left:6px">{{ v.isVerified ? 'Verified' : 'Pending verification' }}</span>
              <div class="text-sm text-muted" style="margin-top:4px">Plate {{ v.plateNumber }} · {{ v.color }} · {{ v.capacity }} seats</div>
            </div>
            <div class="flex gap-8">
              <button class="btn btn-outline btn-sm" @click="toggleActive(v)">{{ v.isActive ? 'Deactivate' : 'Activate' }}</button>
              <button class="btn btn-outline btn-sm" @click="expand(v)">Documents</button>
              <button class="btn btn-danger btn-sm" @click="removeVehicle(v.id)">Delete</button>
            </div>
          </div>

          <div v-if="expandedId === v.id" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--ink-100)">
            <div class="flex gap-8" style="margin-bottom:10px">
              <select v-model="docType" style="width:auto"><option v-for="t in DOC_TYPES" :key="t" :value="t">{{ t }}</option></select>
              <input type="file" @change="onFileChange" accept=".pdf,.jpg,.jpeg,.png" />
              <button class="btn btn-outline btn-sm" @click="uploadDoc(v.id)">Upload</button>
            </div>
            <table v-if="documents[v.id]?.length">
              <thead><tr><th>Type</th><th>Status</th><th></th></tr></thead>
              <tbody>
                <tr v-for="d in documents[v.id]" :key="d.id">
                  <td>{{ d.type }}</td>
                  <td><span class="badge" :class="d.status==='APPROVED' ? 'badge-success' : d.status==='REJECTED' ? 'badge-danger' : 'badge-warning'">{{ d.status }}</span></td>
                  <td>
                    <button class="btn btn-ghost btn-sm" @click="viewDoc(v.id, d.id)">View</button>
                    <button class="btn btn-danger btn-sm" @click="removeDoc(v.id, d.id)">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="text-sm text-muted">No documents uploaded.</div>
          </div>
        </div>
      </div>
    </div>
  `,
};
