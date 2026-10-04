const APPOINTMENTS_API = "../../api/appointments.php";
const PATIENT_RECORDS_API = "../../api/patient_records.php";
const DAILY_GOAL = 5000;
const STATUS = {
  SCHEDULED: "scheduled",
  IN_CONSULTATION: "in_consultation",
  READY_COMPLETE: "ready_complete",
  COMPLETED: "completed",
};
let appointments = [];
let patients = [];
let transactions = [];
document.addEventListener("DOMContentLoaded", () => {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  void refreshDashboardData();
  setInterval(() => void refreshDashboardData(), 2000);
});
function updateDateTime() {
  const now = new Date();
  const dateElement = document.getElementById("currentDate");
  const timeElement = document.getElementById("currentTime");
  if (dateElement) {
    dateElement.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (timeElement) {
    timeElement.textContent = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}
function loadAppointments() {
  return appointments;
}
function loadPatients() {
  return patients;
}
function loadFinanceTransactions() {
  return transactions;
}
function loadDashboardSampleTransactions() {
  return transactions;
}
async function refreshDashboardData() {
  try {
    const [appointmentResponse, patientResponse] = await Promise.all([
      fetch(APPOINTMENTS_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(PATIENT_RECORDS_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);
    const appointmentResult = await appointmentResponse.json();
    const patientResult = await patientResponse.json();
    if (!appointmentResponse.ok || !appointmentResult.success) {
      throw new Error(appointmentResult.message || "Appointments unavailable.");
    }
    if (!patientResponse.ok || !patientResult.success) {
      throw new Error(patientResult.message || "Patients unavailable.");
    }
    appointments = Array.isArray(appointmentResult.data)
      ? appointmentResult.data
      : [];
    patients = Array.isArray(patientResult.data) ? patientResult.data : [];
    transactions = appointments
      .filter((appointment) => Number(appointment.paymentAmount) > 0)
      .map((appointment) => ({
        id: appointment.id || appointment.appointmentId,
        date: appointment.date || appointment.appointment_date,
        service: appointment.type || appointment.service,
        paid: Number(appointment.paymentAmount) || 0,
      }));
    renderDashboard();
  } catch (error) {
    console.error("Unable to load dashboard data from database:", error);
  }
}
function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function timeToMinutes(time) {
  if (!time) {
    return 0;
  }
  const parts = String(time).split(":");
  return Number(parts[0]) * 60 + Number(parts[1] || 0);
}
function formatTime(time) {
  if (!time) return "";
  const text = String(time).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return text;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (match[4] || (hour >= 12 ? "PM" : "AM")).toUpperCase();

  if (match[4]) {
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour < 12) hour += 12;
  }

  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function getInitials(name) {
  return String(name || "Patient")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function normalizeStatus(status) {
  return String(status || STATUS.SCHEDULED)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
function getTodayAppointments() {
  const today = getTodayKey();
  return loadAppointments()
    .filter((appointment) => appointment.date === today)
    .sort(
      (a, b) =>
        timeToMinutes(a.start || a.time) - timeToMinutes(b.start || b.time),
    );
}
function renderDashboard() {
  const appointments = loadAppointments();
  const patients = loadPatients();
  const transactions = loadFinanceTransactions();
  const dashboardSampleTransactions = loadDashboardSampleTransactions();
  const todayAppointments = getTodayAppointments();
  updatePatientCount(patients);
  updateAppointmentStats(todayAppointments);
  updateClinicSummary(todayAppointments);
  renderTodayAppointments(todayAppointments);
  updateProduction(transactions);
  renderWeeklyChart(dashboardSampleTransactions);
  renderProcedureChart(dashboardSampleTransactions);
}
function updatePatientCount(patients) {
  const element = document.getElementById("totalPatients");
  if (element) {
    element.textContent = patients.length;
  }
}
function updateAppointmentStats(todayAppointments) {
  const total = todayAppointments.length;
  const scheduled = todayAppointments.filter(
    (appointment) => normalizeStatus(appointment.status) === STATUS.SCHEDULED,
  ).length;
  const appointmentsElement = document.getElementById("appointmentsToday");
  const scheduledElement = document.getElementById("scheduledToday");
  if (appointmentsElement) {
    appointmentsElement.textContent = total;
  }
  if (scheduledElement) {
    scheduledElement.textContent = `${scheduled} scheduled`;
  }
}
function updateClinicSummary(appointments) {
  const scheduled = appointments.filter(
    (a) => normalizeStatus(a.status) === STATUS.SCHEDULED,
  ).length;
  const checkedIn = appointments.filter(
    (a) => normalizeStatus(a.status) === STATUS.IN_CONSULTATION,
  ).length;
  const consultation = appointments.filter(
    (a) => normalizeStatus(a.status) === STATUS.IN_CONSULTATION,
  ).length;
  const completed = appointments.filter(
    (a) => normalizeStatus(a.status) === STATUS.COMPLETED,
  ).length;
  setText("summaryScheduled", scheduled);
  setText("summaryCheckedIn", checkedIn);
  setText("summaryConsultation", consultation);
  setText("summaryCompleted", completed);
}
function renderTodayAppointments(appointments) {
  const container = document.getElementById("todayAppointmentsList");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (appointments.length === 0) {
    container.innerHTML = `
<div class="no-appointments">
<i class="fa-regular fa-calendar-xmark"></i>
<div>
No patient appointments today.
</div>
</div>
`;
    return;
  }
  appointments.forEach((appointment) => {
    const item = document.createElement("div");
    item.className = "appointment-item";
    const patient =
      appointment.patient || appointment.patientName || "Unknown Patient";
    const service = appointment.type || appointment.service || "Consultation";
    const time = appointment.start || appointment.time || "10:00";
    const status = normalizeStatus(appointment.status);
    item.innerHTML = `
<div class="patient-info">
<div class="patient-avatar">
${getInitials(patient)}
</div>
<div class="patient-details">
<span class="patient-name">
${escapeHtml(patient)}
</span>
<span class="patient-time">
Today · ${formatTime(time)}
</span>
<div class="patient-service">
${escapeHtml(service)}
</div>
</div>
</div>
<span class="status-badge ${getStatusClass(status)}">
${getStatusLabel(status)}
</span>
`;
    container.appendChild(item);
  });
}
function getStatusLabel(status) {
  const normalizedStatus = normalizeStatus(status);
  switch (normalizedStatus) {
    case STATUS.SCHEDULED:
      return "Scheduled";
    case STATUS.IN_CONSULTATION:
      return "In Consultation";
    case STATUS.READY_COMPLETE:
      return "Ready to Complete";
    case STATUS.COMPLETED:
      return "Completed";
    default:
      return "Scheduled";
  }
}
function getStatusClass(status) {
  const normalizedStatus = normalizeStatus(status);
  switch (normalizedStatus) {
    case STATUS.IN_CONSULTATION:
      return "status-consultation";
    case STATUS.READY_COMPLETE:
      return "status-ready";
    case STATUS.COMPLETED:
      return "status-completed";
    default:
      return "status-scheduled";
  }
}
function getTransactionDate(transaction) {
  return (
    transaction.date ||
    transaction.paymentDate ||
    transaction.transactionDate ||
    ""
  );
}
function getTransactionAmount(transaction) {
  const paid = Number(
    transaction.paid ??
      transaction.amountPaid ??
      transaction.paymentAmount ??
      transaction.amount ??
      0,
  );
  return Number.isFinite(paid) ? paid : 0;
}
function getTransactionService(transaction) {
  return String(
    transaction.service ||
      transaction.serviceType ||
      transaction.type ||
      transaction.procedure ||
      "",
  ).trim();
}
function getDateObject(dateValue) {
  if (!dateValue) {
    return null;
  }
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}
function updateProduction(transactions) {
  const today = getTodayKey();
  const todayRevenue = transactions
    .filter((transaction) => getTransactionDate(transaction) === today)
    .reduce(
      (total, transaction) => total + getTransactionAmount(transaction),
      0,
    );
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyRevenue = transactions
    .filter((transaction) => {
      const date = getDateObject(getTransactionDate(transaction));
      return (
        date &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    })
    .reduce(
      (total, transaction) => total + getTransactionAmount(transaction),
      0,
    );
  const percent = Math.min(100, (todayRevenue / DAILY_GOAL) * 100);
  const value = document.getElementById("productionValue");
  const progress = document.getElementById("productionProgress");
  const label = document.getElementById("productionPercent");
  if (value) {
    value.textContent = `₱${todayRevenue.toLocaleString("en-PH")} / ${DAILY_GOAL.toLocaleString("en-PH")}`;
  }
  if (progress) {
    progress.style.width = `${percent}%`;
  }
  if (label) {
    label.textContent = `${Math.round(percent)}% Complete`;
  }
  setText("todayRevenue", formatPeso(todayRevenue));
  setText("monthlyRevenue", formatPeso(monthlyRevenue));
  const monthLabel = document.getElementById("monthlyRevenueLabel");
  if (monthLabel) {
    monthLabel.textContent = `${new Date().toLocaleDateString("en-US", {
      month: "long",
    })} revenue`;
  }
}
function formatPeso(value) {
  return (
    "₱" +
    Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function renderWeeklyChart(transactions) {
  const container = document.getElementById("weeklyBars");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset);
  const production = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const key = formatDateKey(date);
    const total = transactions
      .filter((transaction) => getTransactionDate(transaction) === key)
      .reduce((sum, transaction) => sum + getTransactionAmount(transaction), 0);
    production.push(total);
  }
  const goal = [
    DAILY_GOAL,
    DAILY_GOAL,
    DAILY_GOAL,
    DAILY_GOAL,
    DAILY_GOAL,
    DAILY_GOAL,
    DAILY_GOAL,
  ];
  const max = DAILY_GOAL;
  for (let i = 0; i < 7; i++) {
    const day = document.createElement("div");
    day.className = "day-bar";
    const productionBar = document.createElement("div");
    productionBar.className = "bar production-bar";
    productionBar.style.height = `${Math.min(100, (production[i] / max) * 100)}%`;
    const goalBar = document.createElement("div");
    goalBar.className = "bar goal-bar";
    goalBar.style.height = `${Math.min(100, (goal[i] / max) * 100)}%`;
    day.appendChild(productionBar);
    day.appendChild(goalBar);
    container.appendChild(day);
  }
}
function renderProcedureChart(transactions) {
  const procedureDonut = document.getElementById("procedureDonut");
  const procedureTotal = document.getElementById("procedureTotal");
  if (!procedureDonut || !procedureTotal) {
    return;
  }
  const procedureTotals = {
    "Tooth Filling": 0,
    "Dental Cleaning": 0,
    Consultation: 0,
    "Tooth Extraction": 0,
    Emergency: 0,
  };
  transactions.forEach((transaction) => {
    const service = getTransactionService(transaction).toLowerCase();
    const amount = getTransactionAmount(transaction);
    if (service.includes("filling")) {
      procedureTotals["Tooth Filling"] += amount;
    } else if (service.includes("cleaning")) {
      procedureTotals["Dental Cleaning"] += amount;
    } else if (
      service.includes("consultation") ||
      service.includes("evaluation")
    ) {
      procedureTotals["Consultation"] += amount;
    } else if (service.includes("extraction")) {
      procedureTotals["Tooth Extraction"] += amount;
    } else if (service.includes("emergency")) {
      procedureTotals["Emergency"] += amount;
    }
  });
  const total = Object.values(procedureTotals).reduce(
    (sum, value) => sum + value,
    0,
  );
  procedureTotal.textContent = formatPeso(total).replace(".00", "");
  if (total === 0) {
    procedureDonut.style.background = "conic-gradient(#dfe5e1 0 100%)";
  } else {
    let current = 0;
    const segments = [];
    const segmentColors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
    ];
    Object.values(procedureTotals).forEach((value, index) => {
      const percentage = (value / total) * 100;
      segments.push(
        `${segmentColors[index]} ${current}% ${current + percentage}%`,
      );
      current += percentage;
    });
    procedureDonut.style.background = `conic-gradient(${segments.join(", ")})`;
  }
  setProcedureLabel(
    "fillingLabel",
    "Fillings",
    procedureTotals["Tooth Filling"],
    total,
  );
  setProcedureLabel(
    "cleaningLabel",
    "Cleaning",
    procedureTotals["Dental Cleaning"],
    total,
  );
  setProcedureLabel(
    "evaluationLabel",
    "Evaluation",
    procedureTotals["Consultation"],
    total,
  );
  setProcedureLabel(
    "extractionLabel",
    "Extraction",
    procedureTotals["Tooth Extraction"],
    total,
  );
  setProcedureLabel(
    "emergencyLabel",
    "Emergency",
    procedureTotals["Emergency"],
    total,
  );
}
function setProcedureLabel(id, label, value, total) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  element.textContent = `${label} ${percentage}%`;
}
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}
function goToAppointments() {
  window.location.href = "Appointment.html";
}
