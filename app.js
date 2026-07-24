// ==========================================================
// FAMILY SERVICE HOURS TRACKER
// Replace the two values below with your Supabase project data.
// ==========================================================
const SUPABASE_URL = "https://judrwlhoridaetsingnz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Zkqj0_zHVTaiZG5mo37Azg_NzYz6jom";

const REQUIRED_HOURS = 36;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let schools = [];
let families = [];
let entries = [];
let selectedAuthorization = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  bindEvents();
  $("entryDate").value = new Date().toISOString().slice(0, 10);

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    await loadApplication(session.user);
  }
}

function bindEvents() {
  $("loginButton").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") login();
  });
  $("logoutButton").addEventListener("click", logout);

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => openTab(button.dataset.tab));
  });

  $("submitHoursButton").addEventListener("click", submitHours);
  $("addFamilyButton").addEventListener("click", addFamily);
  $("refreshDashboardButton").addEventListener("click", refreshAll);
  $("refreshMyEntriesButton").addEventListener("click", loadEntries);
  $("refreshAdminButton").addEventListener("click", loadEntries);

  $("dashboardSearch").addEventListener("input", renderDashboard);
  $("dashboardSchoolFilter").addEventListener("change", renderDashboard);
  $("myStatusFilter").addEventListener("change", renderMyEntries);
  $("myEntrySearch").addEventListener("input", renderMyEntries);
  $("adminStatusFilter").addEventListener("change", renderAdminEntries);
  $("adminSchoolFilter").addEventListener("change", renderAdminEntries);
  $("adminSearch").addEventListener("input", renderAdminEntries);
  $("familySchoolFilter").addEventListener("change", renderFamilies);
  $("familySearch").addEventListener("input", renderFamilies);

  $("exportAdminButton").addEventListener("click", exportAdminEntries);
  $("exportFamiliesButton").addEventListener("click", exportFamilyProgress);

  $("cancelAuthorizationButton").addEventListener("click", closeAuthorizationModal);
  $("confirmAuthorizationButton").addEventListener("click", confirmAuthorization);
}

async function login() {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  $("loginMessage").textContent = "";

  if (!email || !password) {
    $("loginMessage").textContent = "Email and password are required.";
    return;
  }

  setButtonBusy("loginButton", true, "Signing In...");

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  setButtonBusy("loginButton", false, "Sign In");

  if (error) {
    $("loginMessage").textContent = error.message;
    return;
  }

  await loadApplication(data.user);
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  schools = [];
  families = [];
  entries = [];
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("loginPassword").value = "";
}

async function loadApplication(user) {
  currentUser = user;

  const { data: profile, error } = await db
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    await db.auth.signOut();
    $("loginMessage").textContent =
      "Your account does not have a profile. Ask an administrator to add it.";
    return;
  }

  currentProfile = profile;
  $("welcomeText").textContent = `${profile.full_name || profile.email}`;
  $("roleBadge").textContent = profile.role;

  const isAdmin = profile.role === "admin";
  $("adminTabButton").classList.toggle("hidden", !isAdmin);
  $("familiesTabButton").classList.toggle("hidden", !isAdmin);

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  await refreshAll();
  openTab("dashboardTab");
}

async function refreshAll() {
  await loadSchools();
  await loadFamilies();
  await loadEntries();
  populateSchoolDropdowns();
  populateFamilyDropdown();
  renderDashboard();
  renderFamilies();
  renderMyEntries();
  renderAdminEntries();
}

async function loadSchools() {
  const { data, error } = await db
    .from("schools")
    .select("id,school_name,active")
    .eq("active", true)
    .order("school_name");

  if (error) {
    showToast(`Could not load schools: ${error.message}`);
    return;
  }

  schools = data || [];
}

async function loadFamilies() {
  let query = db
    .from("families")
    .select(`
      id,
      family_id,
      student_name,
      grade,
      required_hours,
      active,
      school_id,
      schools ( school_name )
    `)
    .order("student_name");

  const { data, error } = await query;

  if (error) {
    showToast(`Could not load families: ${error.message}`);
    return;
  }

  families = data || [];
}

async function loadEntries() {
  const { data, error } = await db
    .from("service_entries")
    .select(`
      id,
      family_record_id,
      service_date,
      hours,
      activity,
      notes,
      status,
      admin_note,
      submitted_by,
      authorized_by,
      authorized_at,
      created_at,
      families (
        family_id,
        student_name,
        grade,
        school_id,
        schools ( school_name )
      ),
      submitter:profiles!service_entries_submitted_by_fkey (
        full_name,
        email
      )
    `)
    .order("service_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    showToast(`Could not load service entries: ${error.message}`);
    return;
  }

  entries = data || [];
  renderDashboard();
  renderMyEntries();
  renderAdminEntries();
  renderFamilies();
}

function populateSchoolDropdowns() {
  const ids = [
    "dashboardSchoolFilter",
    "adminSchoolFilter",
    "familySchoolFilter",
    "familySchool"
  ];

  ids.forEach((id) => {
    const select = $(id);
    const currentValue = select.value;
    const firstOption =
      id === "familySchool"
        ? '<option value="">Select school</option>'
        : '<option value="">All Schools</option>';

    select.innerHTML =
      firstOption +
      schools
        .map((school) => `<option value="${school.id}">${escapeHtml(school.school_name)}</option>`)
        .join("");

    select.value = currentValue;
  });
}

function populateFamilyDropdown() {
  const activeFamilies = families.filter((family) => family.active);
  $("entryFamily").innerHTML =
    '<option value="">Select family</option>' +
    activeFamilies
      .map((family) => {
        const schoolName = family.schools?.school_name || "";
        return `<option value="${family.id}">
          ${escapeHtml(family.family_id)} — ${escapeHtml(family.student_name)} (${escapeHtml(schoolName)})
        </option>`;
      })
      .join("");
}

async function submitHours() {
  const familyRecordId = Number($("entryFamily").value);
  const serviceDate = $("entryDate").value;
  const hours = Number($("entryHours").value);
  const activity = $("entryActivity").value.trim();
  const notes = $("entryNotes").value.trim();

  $("entryMessage").textContent = "";

  if (!familyRecordId || !serviceDate || !hours || !activity) {
    $("entryMessage").textContent =
      "Family, service date, hours, and activity are required.";
    return;
  }

  if (hours <= 0 || hours > 36) {
    $("entryMessage").textContent = "Hours must be greater than 0 and no more than 36.";
    return;
  }

  setButtonBusy("submitHoursButton", true, "Submitting...");

  const { error } = await db.from("service_entries").insert({
    family_record_id: familyRecordId,
    service_date: serviceDate,
    hours,
    activity,
    notes: notes || null,
    submitted_by: currentUser.id,
    status: "pending"
  });

  setButtonBusy("submitHoursButton", false, "Submit Hours for Authorization");

  if (error) {
    $("entryMessage").textContent = error.message;
    return;
  }

  $("entryHours").value = "";
  $("entryActivity").value = "";
  $("entryNotes").value = "";
  $("entryMessage").style.color = "var(--green)";
  $("entryMessage").textContent = "Hours submitted for administrator authorization.";
  await loadEntries();
}

async function addFamily() {
  if (currentProfile.role !== "admin") return;

  const schoolId = Number($("familySchool").value);
  const familyId = $("familyId").value.trim();
  const studentName = $("studentName").value.trim();
  const grade = $("studentGrade").value;

  $("familyMessage").textContent = "";
  $("familyMessage").style.color = "var(--red)";

  if (!schoolId || !familyId || !studentName || !grade) {
    $("familyMessage").textContent = "School, Family ID, student name, and grade are required.";
    return;
  }

  setButtonBusy("addFamilyButton", true, "Adding...");

  const { error } = await db.from("families").insert({
    school_id: schoolId,
    family_id: familyId,
    student_name: studentName,
    grade,
    required_hours: REQUIRED_HOURS,
    active: true,
    created_by: currentUser.id
  });

  setButtonBusy("addFamilyButton", false, "Add Family");

  if (error) {
    $("familyMessage").textContent = error.message;
    return;
  }

  $("familyId").value = "";
  $("studentName").value = "";
  $("studentGrade").value = "";
  $("familyMessage").style.color = "var(--green)";
  $("familyMessage").textContent = "Family record added.";
  await loadFamilies();
  populateFamilyDropdown();
  renderFamilies();
  renderDashboard();
}

function renderDashboard() {
  const schoolFilter = $("dashboardSchoolFilter").value;
  const search = $("dashboardSearch").value.trim().toLowerCase();

  const progressRows = families
    .filter((family) => family.active)
    .map((family) => {
      const familyEntries = entries.filter((entry) => entry.family_record_id === family.id);
      const approved = sumHours(familyEntries.filter((entry) => entry.status === "approved"));
      const pending = sumHours(familyEntries.filter((entry) => entry.status === "pending"));
      const required = Number(family.required_hours || REQUIRED_HOURS);
      const left = Math.max(0, required - approved);
      return { family, approved, pending, required, left };
    });

  const filteredRows = progressRows.filter(({ family }) => {
    const schoolMatch = !schoolFilter || String(family.school_id) === schoolFilter;
    const text = `${family.family_id} ${family.student_name} ${family.schools?.school_name || ""}`.toLowerCase();
    const searchMatch = !search || text.includes(search);
    return schoolMatch && searchMatch;
  });

  const totalFamilies = progressRows.length;
  const completedFamilies = progressRows.filter((row) => row.left === 0).length;
  const totalApproved = progressRows.reduce((sum, row) => sum + row.approved, 0);
  const pendingHours = progressRows.reduce((sum, row) => sum + row.pending, 0);

  $("summaryCards").innerHTML = [
    summaryCard("Active Families", totalFamilies),
    summaryCard("Completed Requirement", completedFamilies),
    summaryCard("Approved Hours", formatHours(totalApproved)),
    summaryCard("Pending Authorization", formatHours(pendingHours))
  ].join("");

  $("progressTableBody").innerHTML =
    filteredRows.length === 0
      ? emptyRow(8, "No family records found.")
      : filteredRows
          .map(({ family, approved, pending, required, left }) => {
            const percent = Math.min(100, (approved / required) * 100);
            return `
              <tr>
                <td>${escapeHtml(family.schools?.school_name || "")}</td>
                <td><strong>${escapeHtml(family.family_id)}</strong></td>
                <td>${escapeHtml(family.student_name)}</td>
                <td>${escapeHtml(family.grade)}</td>
                <td>${formatHours(approved)}</td>
                <td>${formatHours(pending)}</td>
                <td><strong>${formatHours(left)}</strong></td>
                <td>
                  <div class="progress-shell" title="${percent.toFixed(1)}%">
                    <div class="progress-bar" style="width:${percent}%"></div>
                  </div>
                  <small>${percent.toFixed(1)}%</small>
                </td>
              </tr>`;
          })
          .join("");
}

function renderMyEntries() {
  const statusFilter = $("myStatusFilter").value;
  const search = $("myEntrySearch").value.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (entry.submitted_by !== currentUser?.id) return false;
    if (statusFilter && entry.status !== statusFilter) return false;

    const text = [
      entry.families?.family_id,
      entry.families?.student_name,
      entry.activity,
      entry.families?.schools?.school_name
    ].join(" ").toLowerCase();

    return !search || text.includes(search);
  });

  $("myEntriesTableBody").innerHTML =
    filtered.length === 0
      ? emptyRow(8, "No submitted entries found.")
      : filtered
          .map((entry) => `
            <tr>
              <td>${formatDate(entry.service_date)}</td>
              <td>${escapeHtml(entry.families?.schools?.school_name || "")}</td>
              <td>${escapeHtml(entry.families?.family_id || "")}</td>
              <td>${escapeHtml(entry.families?.student_name || "")}</td>
              <td>${escapeHtml(entry.activity)}</td>
              <td>${formatHours(entry.hours)}</td>
              <td><span class="status ${entry.status}">${entry.status}</span></td>
              <td>${escapeHtml(entry.admin_note || "")}</td>
            </tr>`)
          .join("");
}

function renderAdminEntries() {
  if (currentProfile?.role !== "admin") return;

  const statusFilter = $("adminStatusFilter").value;
  const schoolFilter = $("adminSchoolFilter").value;
  const search = $("adminSearch").value.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (statusFilter && entry.status !== statusFilter) return false;
    if (schoolFilter && String(entry.families?.school_id) !== schoolFilter) return false;

    const text = [
      entry.families?.family_id,
      entry.families?.student_name,
      entry.submitter?.full_name,
      entry.submitter?.email,
      entry.activity
    ].join(" ").toLowerCase();

    return !search || text.includes(search);
  });

  $("adminEntriesTableBody").innerHTML =
    filtered.length === 0
      ? emptyRow(10, "No service entries match the selected filters.")
      : filtered
          .map((entry) => {
            const actions =
              entry.status === "pending"
                ? `<div class="action-group">
                    <button class="success" onclick="openAuthorizationModal('${entry.id}','approved')">Approve</button>
                    <button class="danger" onclick="openAuthorizationModal('${entry.id}','rejected')">Reject</button>
                  </div>`
                : `<span class="muted">${entry.authorized_at ? formatDateTime(entry.authorized_at) : ""}</span>`;

            return `
              <tr>
                <td>${formatDate(entry.service_date)}</td>
                <td>${escapeHtml(entry.families?.schools?.school_name || "")}</td>
                <td>${escapeHtml(entry.families?.family_id || "")}</td>
                <td>${escapeHtml(entry.families?.student_name || "")}</td>
                <td>${escapeHtml(entry.families?.grade || "")}</td>
                <td>
                  <strong>${escapeHtml(entry.activity)}</strong>
                  ${entry.notes ? `<div class="muted">${escapeHtml(entry.notes)}</div>` : ""}
                </td>
                <td><strong>${formatHours(entry.hours)}</strong></td>
                <td>${escapeHtml(entry.submitter?.full_name || entry.submitter?.email || "")}</td>
                <td><span class="status ${entry.status}">${entry.status}</span></td>
                <td>${actions}</td>
              </tr>`;
          })
          .join("");
}

function renderFamilies() {
  if (currentProfile?.role !== "admin") return;

  const schoolFilter = $("familySchoolFilter").value;
  const search = $("familySearch").value.trim().toLowerCase();

  const filtered = families.filter((family) => {
    const schoolMatch = !schoolFilter || String(family.school_id) === schoolFilter;
    const text = `${family.family_id} ${family.student_name}`.toLowerCase();
    return schoolMatch && (!search || text.includes(search));
  });

  $("familiesTableBody").innerHTML =
    filtered.length === 0
      ? emptyRow(9, "No family records found.")
      : filtered
          .map((family) => {
            const approved = sumHours(
              entries.filter(
                (entry) =>
                  entry.family_record_id === family.id &&
                  entry.status === "approved"
              )
            );
            const required = Number(family.required_hours || REQUIRED_HOURS);
            const left = Math.max(0, required - approved);

            return `
              <tr>
                <td>${escapeHtml(family.schools?.school_name || "")}</td>
                <td><strong>${escapeHtml(family.family_id)}</strong></td>
                <td>${escapeHtml(family.student_name)}</td>
                <td>${escapeHtml(family.grade)}</td>
                <td>${formatHours(required)}</td>
                <td>${formatHours(approved)}</td>
                <td><strong>${formatHours(left)}</strong></td>
                <td>${family.active ? "Yes" : "No"}</td>
                <td>
                  <button class="${family.active ? "danger" : "success"}"
                    onclick="toggleFamilyActive(${family.id}, ${!family.active})">
                    ${family.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>`;
          })
          .join("");
}

window.openAuthorizationModal = function (entryId, decision) {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) return;

  selectedAuthorization = { entryId, decision };
  $("modalTitle").textContent =
    decision === "approved" ? "Approve Service Hours" : "Reject Service Hours";
  $("modalSummary").textContent =
    `${entry.families?.family_id} — ${entry.families?.student_name}: ${formatHours(entry.hours)} hours`;
  $("authorizationNote").value = "";
  $("confirmAuthorizationButton").className =
    decision === "approved" ? "success" : "danger";
  $("confirmAuthorizationButton").textContent =
    decision === "approved" ? "Approve Hours" : "Reject Hours";
  $("authorizationModal").classList.remove("hidden");
};

function closeAuthorizationModal() {
  selectedAuthorization = null;
  $("authorizationModal").classList.add("hidden");
}

async function confirmAuthorization() {
  if (!selectedAuthorization) return;

  const note = $("authorizationNote").value.trim();
  if (selectedAuthorization.decision === "rejected" && !note) {
    showToast("Please enter an administrator note explaining the rejection.");
    return;
  }

  setButtonBusy("confirmAuthorizationButton", true, "Saving...");

  const { error } = await db
    .from("service_entries")
    .update({
      status: selectedAuthorization.decision,
      admin_note: note || null,
      authorized_by: currentUser.id,
      authorized_at: new Date().toISOString()
    })
    .eq("id", selectedAuthorization.entryId);

  setButtonBusy(
    "confirmAuthorizationButton",
    false,
    selectedAuthorization.decision === "approved" ? "Approve Hours" : "Reject Hours"
  );

  if (error) {
    showToast(error.message);
    return;
  }

  closeAuthorizationModal();
  showToast(`Entry ${selectedAuthorization?.decision || "updated"}.`);
  await loadEntries();
}

window.toggleFamilyActive = async function (familyId, active) {
  if (currentProfile?.role !== "admin") return;

  const { error } = await db
    .from("families")
    .update({ active })
    .eq("id", familyId);

  if (error) {
    showToast(error.message);
    return;
  }

  await loadFamilies();
  populateFamilyDropdown();
  renderFamilies();
  renderDashboard();
}

function openTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));

  $(tabId).classList.remove("hidden");
  document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add("active");
}

function exportAdminEntries() {
  const rows = entries.map((entry) => ({
    "Service Date": entry.service_date,
    "School": entry.families?.schools?.school_name || "",
    "Family ID": entry.families?.family_id || "",
    "Student Name": entry.families?.student_name || "",
    "Grade": entry.families?.grade || "",
    "Activity": entry.activity,
    "Hours": entry.hours,
    "Status": entry.status,
    "Submitted By": entry.submitter?.full_name || entry.submitter?.email || "",
    "Admin Note": entry.admin_note || "",
    "Authorized At": entry.authorized_at || ""
  }));

  downloadCsv("family-service-entries.csv", rows);
}

function exportFamilyProgress() {
  const rows = families.map((family) => {
    const familyEntries = entries.filter((entry) => entry.family_record_id === family.id);
    const approved = sumHours(familyEntries.filter((entry) => entry.status === "approved"));
    const pending = sumHours(familyEntries.filter((entry) => entry.status === "pending"));
    const required = Number(family.required_hours || REQUIRED_HOURS);

    return {
      "School": family.schools?.school_name || "",
      "Family ID": family.family_id,
      "Student Name": family.student_name,
      "Grade": family.grade,
      "Required Hours": required,
      "Approved Hours": approved,
      "Pending Hours": pending,
      "Hours Left": Math.max(0, required - approved),
      "Active": family.active ? "Yes" : "No"
    };
  });

  downloadCsv("family-hour-progress.csv", rows);
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    showToast("There is no data to export.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function summaryCard(label, value) {
  return `
    <div class="summary-card">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(String(value))}</div>
    </div>`;
}

function sumHours(items) {
  return items.reduce((sum, item) => sum + Number(item.hours || 0), 0);
}

function formatHours(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${month}-${day}-${year}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function emptyRow(columns, message) {
  return `<tr><td colspan="${columns}" class="muted">${escapeHtml(message)}</td></tr>`;
}

function setButtonBusy(id, busy, label) {
  const button = $(id);
  button.disabled = busy;
  button.textContent = label;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
