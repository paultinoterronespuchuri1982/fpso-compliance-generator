/**
 * Front-end logic for the compliance report page.
 *
 * Responsibilities:
 *   - Load sample logs into the form (POST /api/sample-logs).
 *   - Collect the form into a ReportRequest and submit it
 *     (POST /api/generate-report).
 *   - Render the returned report sections into the page.
 *
 * Relies on element IDs defined in templates/index.html.
 */

const form = document.getElementById("logForm");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const generateBtn = document.getElementById("generateBtn");
const loadSampleBtn = document.getElementById("loadSample");
const languageSelect = document.getElementById("language");

/**
 * Show a status message below the form.
 *
 * @param {string} message - Text to display.
 * @param {"ok"|"err"} [kind] - Optional style: "ok" for success, "err" for errors.
 */
function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

/**
 * Fill the form fields with a sample log.
 * Missing values are replaced with empty strings. Equipment status is
 * shown as pretty-printed JSON and maintenance tasks as one per line.
 *
 * @param {object} sample - Object returned by POST /api/sample-logs.
 */
function fillForm(sample) {
  document.getElementById("vessel_name").value = sample.vessel_name || "";
  document.getElementById("date").value = sample.date || "";
  document.getElementById("watch_start").value = sample.watch_start || "";
  document.getElementById("watch_end").value = sample.watch_end || "";
  document.getElementById("chief_officer").value = sample.chief_officer || "";
  document.getElementById("fuel_oil_quantity").value = sample.fuel_oil_quantity || "";
  document.getElementById("operational_summary").value = sample.operational_summary || "";
  document.getElementById("equipment_status").value = sample.equipment_status
    ? JSON.stringify(sample.equipment_status, null, 2)
    : "";
  document.getElementById("maintenance_performed").value = (sample.maintenance_performed || []).join("\n");
  document.getElementById("incidents").value = sample.incidents || "";
  document.getElementById("weather_conditions").value = sample.weather_conditions || "";
  document.getElementById("remarks").value = sample.remarks || "";
}

// "Load sample" button: fetch sample data and fill the form with it.
loadSampleBtn.addEventListener("click", async () => {
  try {
    setStatus("Loading sample logs…");
    const res = await fetch("/api/sample-logs", { method: "POST" });
    if (!res.ok) throw new Error("Failed to load sample logs");
    const sample = await res.json();
    fillForm(sample);
    setStatus("Sample logs loaded.", "ok");
  } catch (err) {
    setStatus(err.message, "err");
  }
});

/**
 * Parse the equipment status textarea as JSON.
 * An empty field is treated as an empty object.
 *
 * @param {string} raw - Text from the equipment status textarea.
 * @returns {object} The parsed equipment status.
 * @throws {Error} If the text is not valid JSON.
 */
function parseEquipmentStatus(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Equipment Status must be valid JSON");
  }
}

/**
 * Render the report sections into the report container.
 * Sections with empty values are skipped. Array values (such as the
 * compliance checklist) become bullet lists; other values become paragraphs.
 *
 * @param {object} report - The `report` object from the API response.
 */
function renderReport(report) {
  reportEl.innerHTML = "";

  const sections = [
    ["Executive Summary", report.executive_summary],
    ["Equipment Status Assessment", report.equipment_status],
    ["Incident Analysis", report.incident_analysis],
    ["Maintenance Review", report.maintenance_review],
    ["Regulatory Compliance Checklist", report.compliance_checklist],
    ["Recommendations", report.recommendations],
    ["Sign-off", report.sign_off_template],
  ];

  for (const [title, content] of sections) {
    if (content === undefined || content === null || content === "") continue;

    const heading = document.createElement("h3");
    heading.textContent = title;
    reportEl.appendChild(heading);

    if (Array.isArray(content)) {
      const ul = document.createElement("ul");
      for (const item of content) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      reportEl.appendChild(ul);
    } else {
      const p = document.createElement("p");
      p.textContent = content;
      reportEl.appendChild(p);
    }
  }
}

/**
 * Submit handler for the log form.
 * Builds the request body from the form fields, calls the API, and
 * renders the report or shows the error. The button is disabled while
 * the request is in flight.
 */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  reportEl.innerHTML = "";

  let equipment_status;
  try {
    equipment_status = parseEquipmentStatus(document.getElementById("equipment_status").value);
  } catch (err) {
    setStatus(err.message, "err");
    return;
  }

  // Request body matching the ReportRequest model in main.py.
  // Field names must match the OperationalLog model exactly.
  const payload = {
    logs: {
      date: document.getElementById("date").value,
      vessel_name: document.getElementById("vessel_name").value,
      watch_start: document.getElementById("watch_start").value,
      watch_end: document.getElementById("watch_end").value,
      chief_officer: document.getElementById("chief_officer").value,
      operational_summary: document.getElementById("operational_summary").value,
      equipment_status,
      incidents: document.getElementById("incidents").value,
      maintenance_performed: document
        .getElementById("maintenance_performed")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      fuel_oil_quantity: document.getElementById("fuel_oil_quantity").value,
      weather_conditions: document.getElementById("weather_conditions").value,
      remarks: document.getElementById("remarks").value,
    },
    language: languageSelect.value,
  };

  generateBtn.disabled = true;
  setStatus("Generating compliance report…");

  try {
    // POST the JSON body. On error, the server sends { "detail": "..." }.
    const res = await fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to generate report");

    renderReport(data.report);
    setStatus(`Report generated for ${data.vessel_name} at ${new Date(data.generated_at).toLocaleString()}`, "ok");
  } catch (err) {
    setStatus(err.message, "err");
  } finally {
    generateBtn.disabled = false;
  }
});
