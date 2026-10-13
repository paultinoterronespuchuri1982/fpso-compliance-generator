// Lógica da interface: lê o formulário, chama a API e mostra o relatório.
// Segurança: o relatório é exibido com textContent (nunca innerHTML), então nenhum texto
// vindo do modelo ou do usuário é interpretado como HTML (evita XSS).

// Referências aos elementos da página, buscados uma única vez.
const form = document.getElementById("logForm");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const generateBtn = document.getElementById("generateBtn");
const loadSampleBtn = document.getElementById("loadSample");
const languageSelect = document.getElementById("language");

// Mostra uma mensagem de status. `kind` pode ser "ok" ou "err" para mudar a cor.
function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

// Preenche o formulário com um registro de exemplo (ou vazio, se campos estiverem ausentes).
function fillForm(sample) {
  document.getElementById("vessel_name").value = sample.vessel_name || "";
  document.getElementById("date").value = sample.date || "";
  document.getElementById("watch_start").value = sample.watch_start || "";
  document.getElementById("watch_end").value = sample.watch_end || "";
  document.getElementById("chief_officer").value = sample.chief_officer || "";
  document.getElementById("fuel_oil_quantity").value = sample.fuel_oil_quantity || "";
  document.getElementById("operational_summary").value = sample.operational_summary || "";
  // Objetos viram JSON legível no campo; ausentes ficam vazios.
  document.getElementById("equipment_status").value = sample.equipment_status
    ? JSON.stringify(sample.equipment_status, null, 2)
    : "";
  // Lista vira um item por linha.
  document.getElementById("maintenance_performed").value = (sample.maintenance_performed || []).join("\n");
  document.getElementById("incidents").value = sample.incidents || "";
  document.getElementById("weather_conditions").value = sample.weather_conditions || "";
  document.getElementById("remarks").value = sample.remarks || "";
}

// Carrega o exemplo do servidor. `async` permite usar `await` para esperar a resposta sem travar a página.
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

// Converte o texto do campo "Equipment Status" em objeto. Lança erro se não for um objeto JSON.
function parseEquipmentStatus(raw) {
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("Equipment Status must be valid JSON");
  }
  // Arrays e valores soltos (ex.: números) não são aceitos; o backend espera um objeto.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Equipment Status must be a JSON object");
  }
  return parsed;
}

// Gera a mensagem de erro a partir da resposta do servidor.
// O FastAPI devolve `detail` como texto (erros gerais) ou como lista (erros de validação).
function errorMessageFrom(data) {
  if (!data || !data.detail) return "Failed to generate report";
  if (Array.isArray(data.detail)) {
    return data.detail.map((item) => item.msg).join("; ");
  }
  return data.detail;
}

// Desenha as seções do relatório. Cada conteúdo é inserido com textContent, por segurança.
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
    // Pula seções vazias.
    if (content === undefined || content === null || content === "") continue;

    const heading = document.createElement("h3");
    heading.textContent = title;
    reportEl.appendChild(heading);

    // Listas viram <ul>; textos viram <p>.
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

// Ao enviar o formulário: valida, chama /api/generate-report e mostra o resultado ou o erro.
form.addEventListener("submit", async (e) => {
  // Impede o recarregamento da página padrão do formulário.
  e.preventDefault();
  reportEl.innerHTML = "";

  let equipment_status;
  try {
    equipment_status = parseEquipmentStatus(document.getElementById("equipment_status").value);
  } catch (err) {
    setStatus(err.message, "err");
    return;
  }

  // Monta o corpo da requisição no formato esperado pelo ReportRequest do backend.
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

  // Desabilita o botão enquanto espera, evitando envios duplicados.
  generateBtn.disabled = true;
  setStatus("Generating compliance report…");

  try {
    const res = await fetch("/api/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Se o servidor devolver algo que não é JSON (ex.: erro interno), usamos um objeto vazio.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(errorMessageFrom(data));

    renderReport(data.report);
    setStatus(`Report generated for ${data.vessel_name} at ${new Date(data.generated_at).toLocaleString()}`, "ok");
  } catch (err) {
    setStatus(err.message, "err");
  } finally {
    // Executa sempre, com sucesso ou erro, para reabilitar o botão.
    generateBtn.disabled = false;
  }
});
