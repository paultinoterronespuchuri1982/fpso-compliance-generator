const form = document.getElementById("logForm");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const generateBtn = document.getElementById("generateBtn");
const loadSampleBtn = document.getElementById("loadSample");
const languageSelect = document.getElementById("language");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

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

function parseEquipmentStatus(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Equipment Status must be valid JSON");
  }
}

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
