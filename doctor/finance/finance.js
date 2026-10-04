"use strict";
const TRANSACTIONS_API = "../../api/finance/transactions.php";
const PATIENTS_KEY = "dentanueva_patients";
const PATIENT_API = "../../api/patient_records.php";
const APPOINTMENTS_API = "../../api/appointments.php?scope=doctor_appointments";
let transactions = [];
let patients = [];
let collectionPeriod = "today";
let revenueMode = "today";
let expenseData = [];
let currentDetailsTransaction = null;
const sampleProcedureData = [
  { name: "Dental Cleaning", amount: 18500 },
  { name: "Tooth Filling / Pasta", amount: 14200 },
  { name: "Tooth Extraction", amount: 11800 },
  { name: "Braces Adjustment", amount: 9600 },
  { name: "Root Canal", amount: 8200 },
  { name: "Consultation", amount: 5600 },
];
const sampleExpenseCategoryData = [
  { name: "Dental Supplies", amount: 18500, color: "#16803d" },
  { name: "Utilities", amount: 9200, color: "#2f80ed" },
  { name: "Staff Salaries", amount: 28500, color: "#f2994a" },
  { name: "Equipment Maintenance", amount: 7600, color: "#9b51e0" },
  { name: "Marketing", amount: 4800, color: "#27ae60" },
];
document.addEventListener("DOMContentLoaded", async () => {
  await loadPatients();
  setupEvents();
  await loadTransactions();
  openTreatmentChargeFromQuery();
});
function setupEvents() {
  setupPatientSelector();
  document
    .getElementById("transactionSearch")
    ?.addEventListener("input", renderTransactions);
  document
    .getElementById("paymentMethodFilter")
    ?.addEventListener("change", renderTransactions);
  document
    .getElementById("transactionDateFilter")
    ?.addEventListener("change", renderTransactions);
  document
    .getElementById("revenueSwitch")
    ?.addEventListener("click", toggleRevenueMode);
  document.querySelectorAll(".collection-tab").forEach((button) => {
    button.addEventListener("click", () => {
      collectionPeriod = button.dataset.period || "today";
      document.querySelectorAll(".collection-tab").forEach((item) => {
        item.classList.remove("active");
      });
      button.classList.add("active");
      renderCollection();
    });
  });
  document
    .getElementById("recordPaymentButton")
    ?.addEventListener("click", openPaymentModal);
  document
    .getElementById("closePaymentModal")
    ?.addEventListener("click", closePaymentModal);
  document
    .getElementById("cancelPaymentButton")
    ?.addEventListener("click", closePaymentModal);
  document
    .getElementById("savePaymentButton")
    ?.addEventListener("click", savePayment);
  document
    .getElementById("paymentModal")
    ?.addEventListener("click", (event) => {
      if (event.target === document.getElementById("paymentModal")) {
        closePaymentModal();
      }
    });
  document
    .getElementById("closeDetailsBtn")
    ?.addEventListener("click", closeDetailsModal);
  document
    .getElementById("detailsCloseButton")
    ?.addEventListener("click", closeDetailsModal);
  document
    .getElementById("printReceiptBtn")
    ?.addEventListener("click", printReceipt);
  document
    .getElementById("detailsModal")
    ?.addEventListener("click", (event) => {
      if (event.target === document.getElementById("detailsModal")) {
        closeDetailsModal();
      }
    });
}
async function loadTransactions() {
  try {
    const response = await fetch(TRANSACTIONS_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load finance transactions.");
    }
    transactions = (Array.isArray(result.data) ? result.data : []).map(
      normalizeDatabaseTransaction,
    );
    renderFinance();
  } catch (error) {
    console.error("Unable to load finance transactions:", error);
    transactions = [];
    renderFinance();
  }
}
function normalizePaymentMethod(method) {
  const value = String(method || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (value === "cash") {
    return "Cash";
  }
  if (value === "gcash") {
    return "GCash";
  }
  if (value === "bank_transfer" || value === "bank transfer") {
    return "Bank Transfer";
  }
  return "";
}
function normalizeDatabaseTransaction(item) {
  const total = Number(item.total_amount) || 0;
  const discount = Number(item.discount_amount) || 0;
  const paid = Math.max(Number(item.paid_amount) || 0, 0);
  const databaseBalance = Number(item.balance_amount);
  const finalBalance = Number.isFinite(databaseBalance)
    ? Math.max(databaseBalance, 0)
    : Math.max(total - discount - paid, 0);
  const patientName =
    String(item.patient_name || "").trim() ||
    String(item.patient_id || "Unknown Patient");
  const paymentHistory = Array.isArray(item.paymentHistory)
    ? item.paymentHistory.map((payment) => ({
        id: payment.payment_uid || payment.payment_id || "",
        paymentId: Number(payment.payment_id) || 0,
        paymentUid: payment.payment_uid || "",
        transactionId: Number(payment.transaction_id) || 0,
        patientId: payment.patient_id || item.patient_id || "",
        amount: Number(payment.amount) || 0,
        paymentMethod: normalizePaymentMethod(
          payment.payment_method || payment.paymentMethod,
        ),
        paymentSource: String(payment.payment_source || "")
          .trim()
          .toLowerCase(),
        status: String(payment.status || "")
          .trim()
          .toLowerCase(),
        paidAt: payment.paid_at || payment.created_at || "",
        createdAt: payment.created_at || "",
        date: payment.paid_at
          ? String(payment.paid_at).slice(0, 10)
          : payment.created_at
            ? String(payment.created_at).slice(0, 10)
            : item.created_at
              ? String(item.created_at).slice(0, 10)
              : getTodayKey(),
        time: payment.paid_at
          ? String(payment.paid_at).slice(11, 16)
          : payment.created_at
            ? String(payment.created_at).slice(11, 16)
            : "",
      }))
    : [];
  const paidPayments = paymentHistory.filter(
    (payment) => payment.status === "paid" && payment.amount > 0,
  );
  const methods = [
    ...new Set(
      paidPayments.map((payment) => payment.paymentMethod).filter(Boolean),
    ),
  ];
  return {
    id: item.transaction_uid || String(item.transaction_id || ""),
    transactionId: Number(item.transaction_id) || 0,
    transactionUid: item.transaction_uid || "",
    invoice: item.transaction_uid || String(item.transaction_id || ""),
    patientId: item.patient_id || "",
    patient: patientName,
    patientName,
    service: item.service_name || "Consultation",
    date: item.created_at
      ? String(item.created_at).slice(0, 10)
      : getTodayKey(),
    time: item.created_at ? String(item.created_at).slice(11, 16) : "00:00",
    total,
    discount,
    paid,
    balance: finalBalance,
    method: methods[0] || "",
    paymentMethod: methods.join(" + "),
    status:
      item.status === "paid"
        ? "Paid"
        : item.status === "partial"
          ? "Partial"
          : "Unpaid",
    paymentHistory,
    createdAt: item.created_at || "",
    updatedAt: item.updated_at || "",
  };
}
async function loadPatients() {
  try {
    const response = await fetch(PATIENT_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load patients.");
    }
    const records = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.records)
        ? result.records
        : [];
    patients = records;
  } catch (error) {
    console.error("Unable to load DentaNueva patients:", error);
    try {
      const stored = localStorage.getItem(PATIENTS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      patients = Array.isArray(parsed) ? parsed : [];
    } catch (storageError) {
      patients = [];
    }
  }
  await loadDoctorPatients();
}
async function loadDoctorPatients() {
  try {
    const response = await fetch(APPOINTMENTS_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load doctor patients.");
    }
    const appointments = Array.isArray(result.data) ? result.data : [];
    const doctorPatientIds = new Set(
      appointments
        .map((appointment) =>
          String(
            appointment.patientId ||
              appointment.patient_id ||
              appointment.patient ||
              "",
          ).trim(),
        )
        .filter(Boolean),
    );
    patients = patients.filter((patient) =>
      doctorPatientIds.has(getPatientId(patient)),
    );
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  } catch (error) {
    console.error("Unable to load doctor patients:", error);
    patients = [];
  }
  setupPatientSelector();
}
function getPatientFullName(patient) {
  if (!patient) {
    return "";
  }
  return (
    [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() ||
    String(patient.fullName || patient.name || "").trim()
  );
}
function getPatientId(patient) {
  return String(
    patient?.patientId || patient?.patient_id || patient?.id || "",
  ).trim();
}
function findPatientById(patientId) {
  if (!patientId) {
    return null;
  }
  return (
    patients.find(
      (patient) => getPatientId(patient) === String(patientId).trim(),
    ) || null
  );
}
function findPatientByName(name) {
  if (!name) {
    return null;
  }
  const target = String(name).trim().toLowerCase();
  return (
    patients.find(
      (patient) => getPatientFullName(patient).toLowerCase() === target,
    ) || null
  );
}
function findPatientByNameOrId(value) {
  return findPatientById(value) || findPatientByName(value);
}
function setupPatientSelector() {
  const patientInput = document.getElementById("paymentPatient");
  const datalist = document.getElementById("paymentPatientList");
  if (!patientInput || !datalist) {
    return;
  }
  datalist.innerHTML = "";
  patients
    .slice()
    .sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b)))
    .forEach((patient) => {
      const option = document.createElement("option");
      const name = getPatientFullName(patient);
      const patientId = getPatientId(patient);
      option.value = name;
      option.label = `${name} · ${patientId}`;
      datalist.appendChild(option);
    });
  patientInput.setAttribute("list", "paymentPatientList");
  patientInput.oninput = syncPaymentPatientId;
  patientInput.onchange = syncPaymentPatientId;
}
function syncPaymentPatientId() {
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  if (!patientInput || !patientIdInput) {
    return;
  }
  const patient = findPatientByNameOrId(patientInput.value);
  patientIdInput.value = patient ? getPatientId(patient) : "";
  if (patient) {
    patientInput.value = getPatientFullName(patient);
  }
}
function getPaymentPatient() {
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  const patient =
    findPatientById(patientIdInput?.value) ||
    findPatientByNameOrId(patientInput?.value);
  if (!patient) {
    return null;
  }
  if (patientIdInput) {
    patientIdInput.value = getPatientId(patient);
  }
  if (patientInput) {
    patientInput.value = getPatientFullName(patient);
  }
  return patient;
}
function renderFinance() {
  renderRevenueCard();
  renderSummaryCards();
  renderTransactions();
  renderProcedureChart();
  renderRevenueExpenseChart();
  renderExpenseChart();
  renderCollection();
  renderAuditTrail();
}
function toggleRevenueMode() {
  revenueMode = revenueMode === "today" ? "month" : "today";
  renderRevenueCard();
}
function renderRevenueCard() {
  const title = document.getElementById("revenueCardTitle");
  const amount = document.getElementById("revenueAmount");
  const subtitle = document.getElementById("revenueSubtitle");
  const switchText = document.getElementById("revenueSwitchText");
  const todayRevenue = getTodayRevenue();
  const monthRevenue = getMonthlyRevenue();
  if (title) {
    title.textContent =
      revenueMode === "today" ? "Today's Revenue" : "Monthly Revenue";
  }
  if (amount) {
    amount.textContent = formatMoney(
      revenueMode === "today" ? todayRevenue : monthRevenue,
    );
  }
  if (subtitle) {
    subtitle.textContent =
      revenueMode === "today" ? "Today's collection" : getCurrentMonthLabel();
  }
  if (switchText) {
    switchText.textContent = revenueMode === "today" ? "Today" : "This Month";
  }
  const monthlyRevenue = document.getElementById("monthlyRevenueAmount");
  if (monthlyRevenue) {
    monthlyRevenue.textContent = formatMoney(monthRevenue);
  }
}
function renderSummaryCards() {
  const outstanding = transactions.reduce(
    (sum, transaction) => sum + getBalance(transaction),
    0,
  );
  const outstandingElement = document.getElementById("outstandingBalance");
  if (outstandingElement) {
    outstandingElement.textContent = formatMoney(outstanding);
  }
  const count = transactions.filter(
    (transaction) => getBalance(transaction) > 0,
  ).length;
  const subtitle = document.getElementById("outstandingSubtitle");
  if (subtitle) {
    subtitle.textContent = `${count} active balance${count === 1 ? "" : "s"}`;
  }
  const expenses = getMonthlyExpenses();
  const expensesElement = document.getElementById("monthlyExpenses");
  if (expensesElement) {
    expensesElement.textContent = formatMoney(expenses);
  }
  const expenseChange = document.getElementById("expenseChange");
  if (expenseChange) {
    expenseChange.textContent = "0% vs last month";
  }
}
function getFilteredTransactions() {
  const search = (document.getElementById("transactionSearch")?.value || "")
    .trim()
    .toLowerCase();
  const selectedMethod = normalizePaymentMethod(
    document.getElementById("paymentMethodFilter")?.value || "",
  );
  const dateFilter =
    document.getElementById("transactionDateFilter")?.value || "all";
  return transactions
    .filter((transaction) => {
      if (!search) {
        return true;
      }
      return (
        transaction.patient.toLowerCase().includes(search) ||
        transaction.invoice.toLowerCase().includes(search) ||
        transaction.service.toLowerCase().includes(search)
      );
    })
    .filter((transaction) => {
      if (!selectedMethod) {
        return true;
      }
      return getPaymentHistory(transaction).some(
        (payment) => payment.paymentMethod === selectedMethod,
      );
    })
    .filter((transaction) => {
      if (dateFilter === "all") {
        return true;
      }
      if (dateFilter === "today") {
        return transaction.date === getTodayKey();
      }
      const date = new Date(
        `${transaction.date}T${transaction.time || "00:00"}`,
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateFilter === "month") {
        return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth()
        );
      }
      if (dateFilter === "week") {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        return date >= sevenDaysAgo;
      }
      return true;
    })
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function renderTransactions() {
  const body = document.getElementById("transactionsTableBody");
  if (!body) {
    return;
  }
  body.innerHTML = "";
  const filtered = getFilteredTransactions();
  const count = document.getElementById("transactionCount");
  if (count) {
    count.textContent = `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
  }
  if (!filtered.length) {
    body.innerHTML =
      '<tr><td colspan="9" class="empty-table">No transactions found.</td></tr>';
    return;
  }
  filtered.forEach((transaction) => {
    const row = document.createElement("tr");
    const status = getPaymentStatus(transaction);
    row.innerHTML = `<td><div class="patient-cell"><div class="patient-avatar">${getInitials(transaction.patient)}</div><div><span class="patient-name">${escapeHtml(transaction.patient)}</span><span class="invoice-number">${escapeHtml(transaction.id)}</span></div></div></td><td>${escapeHtml(transaction.service)}</td><td><span class="date-main">${formatShortDate(transaction.date)}</span><span class="date-time">${formatTime(transaction.time)}</span></td><td class="money">${formatMoney(transaction.total)}</td><td class="discount-money">${formatMoney(transaction.discount)}</td><td class="money">${formatMoney(transaction.paid)}</td><td class="balance-money">${formatMoney(getBalance(transaction))}</td><td><span class="status-badge ${getStatusClass(status)}">${status}</span></td><td><div class="action-buttons"><button type="button" class="table-action" title="View" onclick="viewTransaction('${escapeJs(transaction.id)}')"><i class="fa-regular fa-eye"></i></button></div></td>`;
    body.appendChild(row);
  });
}
function renderProcedureChart() {
  const container = document.getElementById("procedureChart");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  let data = sampleProcedureData.map((item) => [item.name, item.amount]);
  if (!data.length) {
    return;
  }
  data.sort((a, b) => b[1] - a[1]);
  data = data.slice(0, 6);
  const max = Math.max(...data.map((item) => item[1]), 1);
  data.forEach(([name, value]) => {
    const row = document.createElement("div");
    row.className = "procedure-row";
    const percentage = (value / max) * 100;
    row.innerHTML = `<span class="procedure-name">${escapeHtml(shortenService(name))}</span><div class="procedure-bar-bg"><div class="procedure-bar" style="width:${percentage}%"></div></div><span class="procedure-value">${formatMoney(value)}</span>`;
    container.appendChild(row);
  });
}
function renderRevenueExpenseChart() {
  const svg = document.getElementById("revenueExpenseChart");
  if (!svg) {
    return;
  }
  svg.innerHTML = "";
  const months = Array.from({ length: 12 }, (_, index) =>
    new Date(new Date().getFullYear(), index, 1).toLocaleDateString("en-US", {
      month: "short",
    }),
  );
  const revenue = months.map((_, index) => getRevenueForMonth(index));
  const expenses = months.map(() => 0);
  const allValues = [...revenue, ...expenses];
  const maxValue = Math.max(...allValues, 1000);
  const width = 700;
  const height = 300;
  const left = 50;
  const right = 18;
  const top = 20;
  const bottom = 45;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const xStep = chartWidth / (months.length - 1);
  const svgNamespace = "http://www.w3.org/2000/svg";
  function yPosition(value) {
    return top + chartHeight - (value / maxValue) * chartHeight;
  }
  for (let i = 0; i <= 5; i++) {
    const y = top + (chartHeight / 5) * i;
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", left);
    line.setAttribute("x2", width - right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "chart-grid-line");
    svg.appendChild(line);
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", 4);
    label.setAttribute("y", y + 4);
    label.setAttribute("class", "chart-axis-label");
    label.textContent = formatCompactMoney(maxValue - (maxValue / 5) * i);
    svg.appendChild(label);
  }
  months.forEach((month, index) => {
    const x = left + xStep * index;
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", height - 13);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = month;
    svg.appendChild(label);
  });
  function makePoints(data) {
    return data.map((value, index) => ({
      x: left + xStep * index,
      y: yPosition(value),
    }));
  }
  function makePath(points) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }
  const revenuePoints = makePoints(revenue);
  const expensePoints = makePoints(expenses);
  const revenuePath = document.createElementNS(svgNamespace, "path");
  revenuePath.setAttribute("d", makePath(revenuePoints));
  revenuePath.setAttribute("class", "revenue-line");
  svg.appendChild(revenuePath);
  const expensePath = document.createElementNS(svgNamespace, "path");
  expensePath.setAttribute("d", makePath(expensePoints));
  expensePath.setAttribute("class", "expense-line");
  svg.appendChild(expensePath);
  revenuePoints.forEach((point) => {
    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "revenue-point");
    svg.appendChild(circle);
  });
  expensePoints.forEach((point) => {
    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "expense-point");
    svg.appendChild(circle);
  });
}
function renderExpenseChart() {
  const list = document.getElementById("expenseCategoryList");
  const pie = document.getElementById("expensePieChart");
  if (!list || !pie) {
    return;
  }
  list.innerHTML = "";
  const total = sampleExpenseCategoryData.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  let currentPercent = 0;
  const gradients = [];
  if (!sampleExpenseCategoryData.length || total <= 0) {
    pie.style.background = "none";
    return;
  }
  sampleExpenseCategoryData.forEach((item) => {
    const percentage = (item.amount / total) * 100;
    const end = currentPercent + percentage;
    gradients.push(`${item.color} ${currentPercent}% ${end}%`);
    currentPercent = end;
    const itemElement = document.createElement("div");
    itemElement.className = "expense-category";
    itemElement.innerHTML = `<span class="expense-color" style="background:${item.color}"></span><span>${escapeHtml(item.name)}: ${formatMoney(item.amount)} (${percentage.toFixed(1)}%)</span>`;
    list.appendChild(itemElement);
  });
  pie.style.background = `conic-gradient(${gradients.join(",")})`;
}
function renderCollection() {
  const list = document.getElementById("collectionList");
  const totalElement = document.getElementById("collectionTotal");
  const totalLabel = document.getElementById("collectionTotalLabel");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  const methods = [
    {
      value: "Cash",
      name: "Cash",
      icon: "fa-money-bill-wave",
      className: "cash",
    },
    {
      value: "GCash",
      name: "GCash",
      icon: "fa-mobile-screen-button",
      className: "gcash",
    },
    {
      value: "Bank Transfer",
      name: "Bank Transfer",
      icon: "fa-building-columns",
      className: "bank",
    },
  ];
  let grandTotal = 0;
  methods.forEach((method) => {
    const methodPayments = transactions
      .flatMap((transaction) =>
        getPaymentHistory(transaction).filter(
          (payment) =>
            payment.paymentMethod === method.value &&
            payment.status === "paid" &&
            payment.amount > 0,
        ),
      )
      .filter((payment) => {
        if (collectionPeriod === "today") {
          return payment.date === getTodayKey();
        }
        return isCurrentMonth(payment.date);
      });
    const amount = methodPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    grandTotal += amount;
    const item = document.createElement("div");
    item.className = "collection-item";
    item.innerHTML = `<div class="collection-icon ${method.className}"><i class="fa-solid ${method.icon}"></i></div><div class="collection-details"><span class="collection-name">${method.name}</span><span class="collection-transactions">${methodPayments.length} transaction${methodPayments.length === 1 ? "" : "s"}</span></div><span class="collection-amount">${formatMoney(amount)}</span>`;
    list.appendChild(item);
  });
  if (totalElement) {
    totalElement.textContent = formatMoney(grandTotal);
  }
  if (totalLabel) {
    totalLabel.textContent =
      collectionPeriod === "today"
        ? "Total Collected Today"
        : "Total Collected This Month";
  }
}
function renderAuditTrail() {
  const container = document.getElementById("auditTrail");
  if (!container) {
    return;
  }
  if (!transactions.length) {
    container.innerHTML =
      '<div class="audit-content">No financial activity recorded yet.</div>';
    return;
  }
  const latest = transactions[0];
  const latestPayment = getPaymentHistory(latest)[0];
  container.innerHTML = `<div class="audit-content"><strong>Latest payment record:</strong><br>Patient: ${escapeHtml(latest.patient)}<br>Invoice: ${escapeHtml(latest.invoice)}<br>Amount: ${formatMoney(latestPayment?.amount || latest.paid)}<br>Date: ${formatLongDate(latestPayment?.date || latest.date)}<br>Payment Method: ${escapeHtml(latestPayment?.paymentMethod || latest.method || "-")}</div>`;
}
function openPaymentModal() {
  const modal = document.getElementById("paymentModal");
  if (!modal) {
    return;
  }
  window.__treatmentChargeContext = null;
  const patientInput = document.getElementById("paymentPatient");
  const serviceInput = document.getElementById("paymentService");
  const patientIdInput = document.getElementById("paymentPatientId");
  const paymentDateInput = document.getElementById("paymentDate");
  setupPatientSelector();
  if (patientIdInput) {
    patientIdInput.value = "";
  }
  if (patientInput) {
    patientInput.disabled = false;
    patientInput.readOnly = false;
    patientInput.value = "";
  }
  if (serviceInput) {
    serviceInput.readOnly = false;
    serviceInput.value = "";
  }
  if (paymentDateInput) {
    paymentDateInput.value = getTodayKey();
  }
  document.getElementById("paymentTotal").value = "";
  document.getElementById("paymentDiscount").value = "0";
  modal.classList.add("show");
}
function openTreatmentChargeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const patientId = String(params.get("patient_id") || "").trim();
  const treatmentId = String(params.get("treatment_id") || "").trim();
  const appointmentId = String(params.get("appointment_id") || "").trim();
  const service = String(params.get("service") || "").trim();
  if (!patientId || !treatmentId) {
    return;
  }
  const patient = findPatientById(patientId);
  if (!patient) {
    return;
  }
  const patientName = getPatientFullName(patient);
  const transactionDate = getTodayKey();
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  const serviceInput = document.getElementById("paymentService");
  const patientIdGroup = document.getElementById("paymentPatientIdGroup");
  const paymentDateGroup = document.getElementById("paymentDateGroup");
  const patientIdDisplay = document.getElementById("paymentPatientIdDisplay");
  const paymentDateInput = document.getElementById("paymentDate");
  if (patientInput) {
    patientInput.value = patientName;
    patientInput.readOnly = true;
  }
  if (patientIdInput) {
    patientIdInput.value = patientId;
  }
  if (patientIdDisplay) {
    patientIdDisplay.value = patientId;
  }
  if (serviceInput) {
    serviceInput.value = service || "Dental Treatment";
    serviceInput.readOnly = true;
  }
  if (patientIdGroup) {
    patientIdGroup.style.display = "";
  }
  if (paymentDateGroup) {
    paymentDateGroup.style.display = "";
  }
  if (paymentDateInput) {
    paymentDateInput.value = transactionDate;
  }
  const totalInput = document.getElementById("paymentTotal");
  const discountInput = document.getElementById("paymentDiscount");
  if (totalInput) {
    totalInput.value = "";
    totalInput.focus();
  }
  if (discountInput) {
    discountInput.value = "0";
  }
  window.__treatmentChargeContext = {
    patientId,
    treatmentId,
    appointmentId,
    service: service || "Dental Treatment",
    transactionDate,
  };
  const modal = document.getElementById("paymentModal");
  if (modal) {
    modal.classList.add("show");
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}
function closePaymentModal() {
  document.getElementById("paymentModal")?.classList.remove("show");
}
async function savePayment() {
  const treatmentContext = window.__treatmentChargeContext || null;
  const treatmentFlow = Boolean(
    treatmentContext &&
    treatmentContext.patientId &&
    treatmentContext.treatmentId,
  );
  let patientId = "";
  let treatmentId = "";
  let appointmentId = "";
  let service = "";
  if (treatmentFlow) {
    patientId = String(treatmentContext.patientId || "").trim();
    treatmentId = String(treatmentContext.treatmentId || "").trim();
    appointmentId = String(treatmentContext.appointmentId || "").trim();
    service = String(
      treatmentContext.service ||
        document.getElementById("paymentService")?.value ||
        "",
    ).trim();
  } else {
    const patientRecord = getPaymentPatient();
    patientId = String(
      patientRecord?.patientId || patientRecord?.id || "",
    ).trim();
    service = String(
      document.getElementById("paymentService")?.value || "",
    ).trim();
  }
  const total = Number(document.getElementById("paymentTotal")?.value) || 0;
  const discount =
    Number(document.getElementById("paymentDiscount")?.value) || 0;
  if (!patientId) {
    alert("Please select a valid patient.");
    return;
  }
  if (!service) {
    alert(
      treatmentFlow
        ? "Treatment information is missing."
        : "Please enter the service.",
    );
    return;
  }
  if (total <= 0) {
    alert("Please enter a valid treatment price.");
    return;
  }
  if (discount < 0) {
    alert("Discount cannot be negative.");
    return;
  }
  if (discount > total) {
    alert("Discount cannot be greater than the treatment price.");
    return;
  }
  const saveButton = document.getElementById("savePaymentButton");
  const originalText = saveButton?.textContent || "Create Charge";
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Creating...";
    }
    const response = await fetch(TRANSACTIONS_API, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        patientId,
        appointmentId: appointmentId || null,
        treatmentId: treatmentId || null,
        service,
        total,
        discount,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to create treatment charge.");
    }
    await loadTransactions();
    window.__treatmentChargeContext = null;
    closePaymentModal();
  } catch (error) {
    console.error("Unable to create treatment charge:", error);
    alert(error.message || "Unable to create treatment charge.");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }
  }
}
function viewTransaction(id) {
  const transaction = transactions.find((item) => item.id === id);
  if (transaction) {
    showTransactionDetails(transaction);
  }
}
function getPaymentHistory(transaction) {
  const history = Array.isArray(transaction.paymentHistory)
    ? transaction.paymentHistory
    : [];
  return history
    .filter(
      (payment) =>
        String(payment.status || "").toLowerCase() === "paid" &&
        Number(payment.amount) > 0,
    )
    .map((payment, index) => ({
      id:
        payment.paymentUid ||
        payment.paymentId ||
        `${transaction.id}-${index + 1}`,
      amount: Number(payment.amount) || 0,
      paymentMethod: normalizePaymentMethod(payment.paymentMethod),
      date: payment.paidAt
        ? String(payment.paidAt).slice(0, 10)
        : payment.date || transaction.date,
      time: payment.paidAt
        ? String(payment.paidAt).slice(11, 16)
        : payment.time || transaction.time || "",
      status: "paid",
    }))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function showTransactionDetails(transaction) {
  currentDetailsTransaction = transaction;
  const balance = getBalance(transaction);
  document.getElementById("detailTransactionId").textContent =
    transaction.id || "-";
  document.getElementById("detailPatient").textContent =
    transaction.patient || "-";
  document.getElementById("detailService").textContent =
    transaction.service || "-";
  document.getElementById("detailTotal").textContent = formatMoney(
    transaction.total,
  );
  document.getElementById("detailDiscount").textContent = formatMoney(
    transaction.discount,
  );
  document.getElementById("detailPaid").textContent = formatMoney(
    transaction.paid,
  );
  document.getElementById("detailBalance").textContent = formatMoney(balance);
  const history = getPaymentHistory(transaction);
  const methods = [
    ...new Set(history.map((payment) => payment.paymentMethod).filter(Boolean)),
  ];
  document.getElementById("detailMethod").textContent =
    methods.join(" + ") ||
    transaction.paymentMethod ||
    transaction.method ||
    "-";
  document.getElementById("detailDate").textContent = formatLongDate(
    transaction.date,
  );
  const status = getPaymentStatus(transaction);
  const detailStatus = document.getElementById("detailStatus");
  detailStatus.textContent = status;
  detailStatus.className = `status-badge ${getStatusClass(status)}`;
  renderPaymentHistory(transaction);
  document.getElementById("detailsModal").classList.add("show");
}
function renderPaymentHistory(transaction) {
  const history = getPaymentHistory(transaction);
  const list = document.getElementById("paymentHistoryList");
  const count = document.getElementById("paymentHistoryCount");
  if (!list || !count) {
    return;
  }
  count.textContent = `${history.length} payment${history.length === 1 ? "" : "s"}`;
  list.innerHTML = history.length
    ? history
        .map((payment, index) => {
          const method = payment.paymentMethod;
          const icon =
            method === "GCash"
              ? "fa-mobile-screen-button"
              : method === "Bank Transfer"
                ? "fa-building-columns"
                : "fa-money-bill-wave";
          return `<div class="payment-history-item"><div class="payment-history-item-left"><div class="payment-history-method-icon"><i class="fa-solid ${icon}"></i></div><div class="payment-history-item-info"><strong>${escapeHtml(method || "-")}</strong><span>${escapeHtml(formatLongDate(payment.date))}${payment.time ? ` · ${escapeHtml(formatTime(payment.time))}` : ""}</span></div></div><div class="payment-history-item-right"><strong>${escapeHtml(formatMoney(payment.amount))}</strong><span>Payment ${history.length - index}</span></div></div>`;
        })
        .join("")
    : `<div class="payment-history-empty"><div class="payment-history-empty-icon"><i class="fa-solid fa-clock-rotate-left"></i></div><strong>No payment history</strong><p>Additional payments will appear here.</p></div>`;
}
function closeDetailsModal() {
  document.getElementById("detailsModal")?.classList.remove("show");
  currentDetailsTransaction = null;
}
function printReceipt() {
  const transaction = currentDetailsTransaction;

  if (!transaction) {
    return;
  }

  openPaymentReceipt(transaction);
}
function getTodayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isCurrentMonth(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  );
}
function getTodayRevenue() {
  return transactions
    .filter((transaction) => transaction.date === getTodayKey())
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getMonthlyRevenue() {
  return transactions
    .filter((transaction) => isCurrentMonth(transaction.date))
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getMonthlyExpenses() {
  return expenseData.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}
function getRevenueForMonth(monthIndex) {
  const currentYear = new Date().getFullYear();
  return transactions
    .filter((transaction) => {
      const date = new Date(`${transaction.date}T00:00:00`);
      return (
        date.getFullYear() === currentYear && date.getMonth() === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getBalance(transaction) {
  const databaseBalance = Number(transaction.balance);
  if (Number.isFinite(databaseBalance)) {
    return Math.max(databaseBalance, 0);
  }
  const totalAfterDiscount = Math.max(
    transaction.total - transaction.discount,
    0,
  );
  return Math.max(totalAfterDiscount - transaction.paid, 0);
}
function getPaymentStatus(transaction) {
  const balance = getBalance(transaction);
  const total = Math.max(transaction.total - transaction.discount, 0);
  if (balance <= 0) {
    return "Paid";
  }
  if (transaction.paid > 0 && transaction.paid < total) {
    return "Partial";
  }
  return "Unpaid";
}
function getStatusClass(status) {
  if (status === "Paid") {
    return "status-paid";
  }
  if (status === "Partial") {
    return "status-partial";
  }
  return "status-unpaid";
}
function formatMoney(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function formatCompactMoney(amount) {
  if (amount >= 1000000) {
    return `₱${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `₱${(amount / 1000).toFixed(0)}K`;
  }
  return `₱${Math.round(amount)}`;
}
function formatShortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function formatLongDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(time) {
  if (!time) {
    return "";
  }
  const parts = String(time).split(":");
  let hour = Number(parts[0]);
  const minute = parts[1] || "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }
  return `${hour}:${minute} ${suffix}`;
}
function getCurrentMonthLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function shortenService(service) {
  const replacements = {
    "Dental Cleaning": "Cleaning",
    "Tooth Filling / Pasta": "Composite",
    "Tooth Extraction": "Extraction",
    "Braces Adjustment": "Braces",
  };
  return replacements[service] || service;
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\\\\\").replace(/'/g, "\\'");
}
