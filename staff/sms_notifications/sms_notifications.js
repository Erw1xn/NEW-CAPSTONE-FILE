document.addEventListener("DOMContentLoaded", () => {
  initializeSMSPage();
});
const SMS_PAGE_SIZE = 10;
let smsNotifications = [];
let patients = [];
let appointments = [];
let deleteNotificationId = null;
let toastTimeout = null;
let smsProcessingIds = new Set();
let smsRefreshInProgress = false;
let smsCurrentPage = 1;
let suppressedAutomaticNotifications = new Set();
async function initializeSMSPage() {
  await loadPatients();
  await loadAppointments();
  await loadSMSNotifications();
  await loadSuppressedAutomaticNotifications();
  const cleanupChanged = cleanupOrphanedNotifications();
  const notificationsChanged = syncAppointmentNotifications();
  if (cleanupChanged || notificationsChanged) {
    await saveSMSNotifications();
    await loadSMSNotifications();
  }
  setupSMSPageSorting();
  bindEvents();
  renderPage();
  await processPendingSMSNotifications();
  await syncSMSDeliveryStatuses();
  await loadSMSNotifications();
  renderPage();
}
async function loadPatients() {
  try {
    const response = await fetch("../../api/patient_records.php");
    const data = await response.json();
    patients = data.success && Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error("Unable to load patients:", error);
    patients = [];
  }
}
function getPatientId(patient) {
  return (
    patient?.patientId ||
    patient?.patient_id ||
    patient?.patientID ||
    patient?.id ||
    patient?.referenceId ||
    ""
  );
}
function getPatientName(patient) {
  if (!patient) return "";
  if (patient.fullName) return patient.fullName;
  if (patient.full_name) return patient.full_name;
  if (patient.patientName) return patient.patientName;
  if (patient.name) return patient.name;
  return [patient.firstName, patient.middleName, patient.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}
function getPatientPhone(patient) {
  return (
    patient?.phone ||
    patient?.phoneNumber ||
    patient?.contactNumber ||
    patient?.contact_number ||
    patient?.mobile ||
    patient?.mobileNumber ||
    ""
  );
}
function getPatientEmail(patient) {
  return patient?.email || patient?.emailAddress || "";
}
function getAppointmentDoctorId(appointment) {
  return (
    appointment?.doctorId ||
    appointment?.doctor_id ||
    appointment?.dentistId ||
    appointment?.dentist_id ||
    ""
  );
}
function getAppointmentDoctorName(appointment) {
  return (
    appointment?.doctorName ||
    appointment?.doctor_name ||
    appointment?.dentistName ||
    appointment?.dentist_name ||
    appointment?.dentist ||
    appointment?.doctor ||
    ""
  );
}
function getAppointmentService(appointment) {
  return (
    appointment?.service ||
    appointment?.serviceType ||
    appointment?.service_type ||
    ""
  );
}
function getAppointmentDuration(appointment) {
  const duration = Number(
    appointment?.duration ||
      appointment?.durationMinutes ||
      appointment?.duration_minutes ||
      0,
  );
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}
function getAppointmentEndTime(appointment, appointmentTime) {
  const duration = getAppointmentDuration(appointment);
  const normalizedTime = normalizeTimeForInput(appointmentTime);
  if (!duration || !normalizedTime) return "";
  const [hour, minute] = normalizedTime.split(":").map(Number);
  const start = new Date();
  start.setHours(hour, minute, 0, 0);
  start.setMinutes(start.getMinutes() + duration);
  return (
    String(start.getHours()).padStart(2, "0") +
    ":" +
    String(start.getMinutes()).padStart(2, "0")
  );
}
function refreshNotificationPatientContact(notification) {
  if (!notification) return;
  const patient = patients.find(
    (item) =>
      String(getPatientId(item)) === String(notification.patientId || ""),
  );
  if (!patient) return;
  notification.patientName = getPatientName(patient);
  notification.email = getPatientEmail(patient);
  notification.phone = getPatientPhone(patient);
}
async function loadAppointments() {
  try {
    const response = await fetch("../../api/appointments.php");
    const data = await response.json();
    appointments = data.success && Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error("Unable to load appointments:", error);
    appointments = [];
  }
}
async function loadSMSNotifications() {
  try {
    const response = await fetch("sms_notifications.php?action=fetch");
    const data = await response.json();
    if (data.success) {
      smsNotifications = Array.isArray(data.data) ? data.data : [];
      smsNotifications.forEach((notification) =>
        refreshNotificationPatientContact(notification),
      );
      renderPage();
    } else {
      smsNotifications = [];
      console.error(data.message || "Unable to load notifications.");
    }
  } catch (error) {
    console.error("Unable to fetch notifications:", error);
    smsNotifications = [];
  }
}
async function loadSuppressedAutomaticNotifications() {
  try {
    const response = await fetch("sms_notifications.php?action=suppressed");
    const data = await response.json();
    suppressedAutomaticNotifications =
      data.success && Array.isArray(data.data)
        ? new Set(data.data.map((item) => String(item)))
        : new Set();
  } catch (error) {
    console.error("Unable to load notification suppressions:", error);
    suppressedAutomaticNotifications = new Set();
  }
}
async function saveSMSNotifications() {
  try {
    const response = await fetch("sms_notifications.php?action=save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifications: smsNotifications }),
    });
    const data = await response.json();
    if (!data.success)
      throw new Error(data.message || "Unable to save notifications.");
    return true;
  } catch (error) {
    console.error("Unable to save notifications:", error);
    return false;
  }
}
function setupSMSPageSorting() {
  return;
}
function sortSMSNotifications(notifications) {
  const sorted = [...notifications];
  sorted.sort((a, b) => getNotificationDate(b) - getNotificationDate(a));
  return sorted;
}
function getNotificationDate(notification) {
  if (!notification) return 0;
  const createdAt = notification.createdAt;
  if (createdAt) {
    const createdDate = new Date(createdAt);
    if (!Number.isNaN(createdDate.getTime())) return createdDate.getTime();
  }
  const appointmentDate = notification.appointmentDate || "";
  const appointmentTime = notification.appointmentTime || "00:00";
  if (appointmentDate) {
    const appointmentDateTime = new Date(
      `${appointmentDate}T${appointmentTime}`,
    );
    if (!Number.isNaN(appointmentDateTime.getTime()))
      return appointmentDateTime.getTime();
    const fallbackDate = new Date(appointmentDate);
    if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate.getTime();
  }
  return 0;
}
function generateNotificationSubject(type) {
  return `${type} - DentaNueva Dental Clinic`;
}
function syncAppointmentNotifications() {
  if (!Array.isArray(appointments) || !appointments.length) return;
  if (!Array.isArray(patients) || !patients.length) return;
  let changed = false;
  appointments.forEach((appointment) => {
    if (!appointment) return;
    const patient = findPatientForAppointment(appointment);
    if (!patient) return;
    const patientName = getPatientName(patient);
    const email = getPatientEmail(patient);
    const phone = getPatientPhone(patient);
    if (!patientName || (!email && !phone)) return;
    const appointmentId = getAppointmentId(appointment);
    if (!appointmentId) return;
    const appointmentDate = normalizeDateForInput(
      appointment.date ||
        appointment.appointmentDate ||
        appointment.scheduleDate ||
        appointment.dateOfAppointment ||
        "",
    );
    const appointmentTime = normalizeTimeForInput(
      appointment.start ||
        appointment.time ||
        appointment.appointmentTime ||
        appointment.scheduleTime ||
        "",
    );
    if (!appointmentDate) return;
    const appointmentStatus = getAppointmentStatus(appointment);
    const appointmentSnapshot = getAppointmentSnapshot(
      appointmentDate,
      appointmentTime,
      appointmentStatus,
    );
    const existingAutomaticNotifications = smsNotifications.filter(
      (notification) =>
        notification.source === "appointment" &&
        String(notification.appointmentId || "") === String(appointmentId),
    );
    const previousSnapshot = findLatestAppointmentSnapshot(
      existingAutomaticNotifications,
    );
    if (
      previousSnapshot &&
      hasAppointmentScheduleChanged(
        previousSnapshot,
        appointmentDate,
        appointmentTime,
      )
    ) {
      if (
        appointmentStatus !== "cancelled" &&
        appointmentStatus !== "completed"
      ) {
        const createdReschedule = createAutomaticNotificationIfMissing(
          appointment,
          patient,
          "Appointment Reschedule",
          appointmentDate,
          appointmentTime,
          null,
          previousSnapshot,
        );
        if (createdReschedule) changed = true;
        const removedReminder =
          removeUndeliveredReminderNotifications(appointmentId);
        if (removedReminder) changed = true;
      }
    }
    if (
      appointmentStatus === "scheduled" ||
      appointmentStatus === "confirmed"
    ) {
      const createdConfirmation = createAutomaticNotificationIfMissing(
        appointment,
        patient,
        "Appointment Confirmation",
        appointmentDate,
        appointmentTime,
      );
      if (createdConfirmation) changed = true;
      const reminderType = getReminderTypeForAppointment(
        appointmentDate,
        appointmentTime,
      );
      if (reminderType) {
        const reminderDueAt = getReminderDueAt(
          appointmentDate,
          appointmentTime,
          reminderType,
        );
        if (reminderDueAt) {
          const createdReminder = createAutomaticNotificationIfMissing(
            appointment,
            patient,
            reminderType,
            appointmentDate,
            appointmentTime,
            reminderDueAt.toISOString(),
          );
          if (createdReminder) changed = true;
        }
      }
    }
    if (appointmentStatus === "cancelled") {
      const removedReminder =
        removeUndeliveredReminderNotifications(appointmentId);
      if (removedReminder) changed = true;
      const createdCancellation = createAutomaticNotificationIfMissing(
        appointment,
        patient,
        "Appointment Cancellation",
        appointmentDate,
        appointmentTime,
      );
      if (createdCancellation) changed = true;
    }
    updateAppointmentNotificationSnapshots(
      existingAutomaticNotifications,
      appointmentSnapshot,
    );
  });
  if (changed) return true;
  return false;
}
function getAppointmentStatus(appointment) {
  if (!appointment) return "";
  const rawStatus =
    appointment.status ||
    appointment.appointmentStatus ||
    appointment.appointment_status ||
    appointment.state ||
    "";
  const value = String(rawStatus)
    .trim()
    .toLowerCase()
    .replace(/[\_\-]+/g, " ")
    .replace(/\s+/g, " ");
  if (
    value === "confirmed" ||
    value === "confirm" ||
    value === "scheduled" ||
    value === "schedule" ||
    value === "pending" ||
    value === "waiting"
  )
    return "scheduled";
  if (value === "cancelled" || value === "canceled" || value === "cancel")
    return "cancelled";
  if (value === "completed" || value === "complete" || value === "done")
    return "completed";
  if (value === "checked in" || value === "checkedin" || value === "check in")
    return "checkedin";
  if (value === "in consultation" || value === "inconsultation")
    return "in consultation";
  if (value === "no show" || value === "noshow") return "no-show";
  return value;
}
function getAppointmentId(appointment) {
  return (
    appointment?.appointment_id ||
    appointment?.appointmentId ||
    appointment?.id ||
    appointment?.referenceId ||
    ""
  );
}
function getAppointmentSnapshot(date, time, status) {
  return { date: date || "", time: time || "", status: status || "" };
}
function findLatestAppointmentSnapshot(notifications) {
  if (!Array.isArray(notifications) || !notifications.length) return null;
  const sorted = [...notifications].sort(
    (a, b) => getNotificationDate(b) - getNotificationDate(a),
  );
  const notification = sorted.find(
    (item) => item.appointmentSnapshot || item.appointmentDate,
  );
  if (!notification) return null;
  if (notification.appointmentSnapshot) return notification.appointmentSnapshot;
  return {
    date: notification.appointmentDate || "",
    time: notification.appointmentTime || "",
    status: "",
  };
}
function hasAppointmentScheduleChanged(
  previousSnapshot,
  currentDate,
  currentTime,
) {
  if (!previousSnapshot) return false;
  const previousDate = normalizeDateForInput(previousSnapshot.date || "");
  const previousTime = normalizeTimeForInput(previousSnapshot.time || "");
  const newDate = normalizeDateForInput(currentDate || "");
  const newTime = normalizeTimeForInput(currentTime || "");
  return previousDate !== newDate || previousTime !== newTime;
}
function updateAppointmentNotificationSnapshots(
  notifications,
  appointmentSnapshot,
) {
  if (!Array.isArray(notifications)) return;
  notifications.forEach((notification) => {
    notification.appointmentSnapshot = appointmentSnapshot;
  });
}
function getReminderTypeForAppointment(appointmentDate, appointmentTime) {
  const normalizedAppointmentDate = normalizeDateForInput(appointmentDate);
  if (!normalizedAppointmentDate) return null;
  const appointmentDateTime = createLocalDateTimeFromDateAndTime(
    normalizedAppointmentDate,
    appointmentTime,
  );
  if (!appointmentDateTime || Number.isNaN(appointmentDateTime.getTime()))
    return null;
  if (appointmentDateTime.getTime() <= Date.now()) return null;
  const today = getLocalDateOnly(new Date());
  const appointmentDay = getLocalDateOnly(appointmentDateTime);
  const difference = getDateDifferenceInDays(today, appointmentDay);
  if (difference === 0) return "Same-Day Reminder";
  if (difference > 0) return "Appointment Reminder";
  return null;
}
function getReminderDueAt(appointmentDate, appointmentTime, reminderType) {
  const normalizedDate = normalizeDateForInput(appointmentDate);
  const normalizedTime = normalizeTimeForInput(appointmentTime);
  if (!normalizedDate || !normalizedTime) return null;
  const appointmentDateTime = createLocalDateTimeFromDateAndTime(
    normalizedDate,
    normalizedTime,
  );
  if (!appointmentDateTime || Number.isNaN(appointmentDateTime.getTime()))
    return null;
  if (reminderType === "Appointment Reminder")
    return new Date(appointmentDateTime.getTime() - 24 * 60 * 60 * 1000);
  if (reminderType === "Same-Day Reminder")
    return new Date(appointmentDateTime.getTime() - 2 * 60 * 60 * 1000);
  return null;
}
function createLocalDateTimeFromDateAndTime(dateString, timeString) {
  const normalizedDate = normalizeDateForInput(dateString);
  const normalizedTime = normalizeTimeForInput(timeString);
  if (!normalizedDate) return null;
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const [hour, minute] = (normalizedTime || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}
function getLocalDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function getDateDifferenceInDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (endDate.getTime() - startDate.getTime()) / millisecondsPerDay,
  );
}
function getAutomaticNotificationKey(
  appointmentId,
  notificationType,
  channel,
  appointmentDate = "",
  appointmentTime = "",
) {
  const base = `${appointmentId}|${notificationType}|${channel}`;
  if (
    notificationType === "Appointment Reminder" ||
    notificationType === "Same-Day Reminder" ||
    notificationType === "Appointment Reschedule"
  ) {
    return `${base}|${appointmentDate || ""}|${appointmentTime || ""}`;
  }
  return base;
}
function createAutomaticNotificationUID(
  appointmentId,
  notificationType,
  channel,
  appointmentDate = "",
  appointmentTime = "",
) {
  const key = getAutomaticNotificationKey(
    appointmentId,
    notificationType,
    channel,
    appointmentDate,
    appointmentTime,
  );
  let hash1 = 2166136261;
  let hash2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 16777619);
    hash2 ^= code + i;
    hash2 = Math.imul(hash2, 16777619);
  }
  return `NTF-${(hash1 >>> 0).toString(36)}-${(hash2 >>> 0).toString(36)}`;
}
function createAutomaticNotificationIfMissing(
  appointment,
  patient,
  notificationType,
  appointmentDate,
  appointmentTime,
  scheduledFor = null,
  previousSnapshot = null,
) {
  const appointmentId = getAppointmentId(appointment);
  if (!appointmentId) return false;
  const isReminder =
    notificationType === "Appointment Reminder" ||
    notificationType === "Same-Day Reminder";
  const patientName = getPatientName(patient);
  const patientId = getPatientId(patient);
  const phone = getPatientPhone(patient);
  const email = getPatientEmail(patient);
  const doctorId = getAppointmentDoctorId(appointment);
  const doctorName = getAppointmentDoctorName(appointment);
  const service = getAppointmentService(appointment);
  const duration = getAppointmentDuration(appointment);
  const appointmentEndTime = getAppointmentEndTime(
    appointment,
    appointmentTime,
  );
  const messageContext = {
    patientName,
    patientId,
    appointmentDate,
    appointmentTime,
    appointmentEndTime,
    doctorName,
    service,
    duration,
    previousSnapshot,
  };
  const emailMessage = generateAutomaticAppointmentMessage(
    messageContext,
    notificationType,
  );
  const smsMessage = generateAutomaticAppointmentSMSMessage(
    messageContext,
    notificationType,
  );
  const appointmentSnapshot = getAppointmentSnapshot(
    appointmentDate,
    appointmentTime,
    getAppointmentStatus(appointment),
  );
  let created = false;
  const createChannelNotification = (channel, contactMessage) => {
    const contactAvailable = channel === "email" ? email : phone;
    if (!contactAvailable) return false;
    const notificationKey = getAutomaticNotificationKey(
      appointmentId,
      notificationType,
      channel,
      appointmentDate,
      appointmentTime,
    );
    if (suppressedAutomaticNotifications.has(notificationKey)) return false;
    const alreadyExists = smsNotifications.some(
      (notification) =>
        notification.source === "appointment" &&
        getAutomaticNotificationKey(
          notification.appointmentId,
          notification.type,
          String(notification.channel || "email").toLowerCase(),
          notification.appointmentDate || "",
          notification.appointmentTime || "",
        ) === notificationKey,
    );
    if (alreadyExists) return false;
    smsNotifications.unshift({
      id: createAutomaticNotificationUID(
        appointmentId,
        notificationType,
        channel,
        appointmentDate,
        appointmentTime,
      ),
      appointmentId,
      patientId,
      patientName,
      phone,
      email,
      channel,
      doctorId,
      doctorName,
      service,
      duration,
      appointmentEndTime,
      subject: generateNotificationSubject(notificationType),
      message: contactMessage,
      type: notificationType,
      appointmentType: notificationType,
      appointmentDate,
      appointmentTime,
      status: "Pending",
      deliveryStatus: "Pending",
      createdAt: new Date().toISOString(),
      sentAt: null,
      failedAt: null,
      failureReason: null,
      source: "appointment",
      scheduledFor: isReminder && scheduledFor ? scheduledFor : null,
      isScheduledReminder: isReminder,
      appointmentSnapshot,
    });
    return true;
  };
  if (email && createChannelNotification("email", emailMessage)) created = true;
  if (phone && createChannelNotification("sms", smsMessage)) created = true;
  return created;
}
function buildScheduleLines(context) {
  const formattedDate = context.appointmentDate
    ? formatDate(context.appointmentDate)
    : "Not specified";
  const formattedStart = context.appointmentTime
    ? formatTime(context.appointmentTime)
    : "Not specified";
  const formattedEnd = context.appointmentEndTime
    ? formatTime(context.appointmentEndTime)
    : "";
  const timeRange = formattedEnd
    ? `${formattedStart} - ${formattedEnd}`
    : formattedStart;
  const formattedDuration = context.duration
    ? `${context.duration} minutes`
    : "Not specified";
  return {
    formattedDate,
    formattedStart,
    formattedEnd,
    timeRange,
    formattedDuration,
    doctorName: context.doctorName || "Not yet assigned",
    service: context.service || "General consultation",
  };
}
function generateAutomaticAppointmentMessage(context, notificationType) {
  const name = context.patientName || "Patient";
  const s = buildScheduleLines(context);
  const detailsBlock =
    `Date: ${s.formattedDate}\n` +
    `Time: ${s.timeRange}\n` +
    `Doctor: ${s.doctorName}\n` +
    `Service: ${s.service}\n` +
    `Duration: ${s.formattedDuration}`;
  const closing = "Thank you for choosing DentaNueva Dental Clinic!";
  switch (notificationType) {
    case "Appointment Confirmation":
      return (
        `Hello ${name},\n\n` +
        `Your appointment at DentaNueva Dental Clinic has been confirmed. Here are your appointment details:\n\n` +
        `${detailsBlock}\n\n` +
        `Please arrive at least 10 minutes before your scheduled time. If you need to reschedule or cancel, please contact us as soon as possible.\n\n` +
        closing
      );
    case "Appointment Reminder":
      return (
        `Hello ${name},\n\n` +
        `This is a friendly reminder about your upcoming appointment tomorrow at DentaNueva Dental Clinic.\n\n` +
        `${detailsBlock}\n\n` +
        `Please arrive 10 minutes early. See you!\n\n` +
        closing
      );
    case "Same-Day Reminder":
      return (
        `Hello ${name},\n\n` +
        `This is a reminder that you have an appointment today at DentaNueva Dental Clinic.\n\n` +
        `${detailsBlock}\n\n` +
        `Please arrive 10 minutes early. We look forward to seeing you today!\n\n` +
        closing
      );
    case "Appointment Reschedule": {
      const previous = context.previousSnapshot;
      const previousLine =
        previous && previous.date
          ? `Previous Schedule: ${formatDate(previous.date)}${
              previous.time ? ` at ${formatTime(previous.time)}` : ""
            }\n`
          : "";
      return (
        `Hello ${name},\n\n` +
        `Your appointment at DentaNueva Dental Clinic has been rescheduled. Please see your updated appointment details below:\n\n` +
        `${previousLine}${detailsBlock}\n\n` +
        `If this new schedule does not work for you, please contact the clinic to arrange another time. Thank you for your understanding!\n\n` +
        closing
      );
    }
    case "Appointment Cancellation":
      return (
        `Hello ${name},\n\n` +
        `Your appointment at DentaNueva Dental Clinic has been cancelled. Here were the appointment details:\n\n` +
        `${detailsBlock}\n\n` +
        `If you would like to book a new appointment, please contact the clinic or visit us again. We're sorry for any inconvenience.\n\n` +
        closing
      );
    default:
      return (
        `Hello ${name},\n\n` +
        `You have a notification from DentaNueva Dental Clinic.\n\n` +
        `${detailsBlock}\n\n` +
        closing
      );
  }
}
function generateAutomaticAppointmentSMSMessage(context, notificationType) {
  const limitText = (value, maxLength) => {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3).trim() + "...";
  };
  const name = limitText(context.patientName || "Patient", 18);
  const s = buildScheduleLines(context);
  const shortDate = limitText(s.formattedDate, 12);
  const shortTime = limitText(s.timeRange, 15);
  const doctor = limitText(s.doctorName, 18);
  const service = limitText(s.service, 18);
  switch (notificationType) {
    case "Appointment Confirmation":
      return `DentaNueva: Hi ${name}, CONFIRMED ${shortDate} ${shortTime}. Dr ${doctor}. ${service}. Arrive 10 mins early.`;
    case "Appointment Reminder":
      return `DentaNueva: Hi ${name}, REMINDER: TOMORROW ${shortDate} ${shortTime}. Dr ${doctor}. ${service}.`;
    case "Same-Day Reminder":
      return `DentaNueva: Hi ${name}, REMINDER: TODAY ${shortDate} ${shortTime}. Dr ${doctor}. ${service}.`;
    case "Appointment Reschedule":
      return `DentaNueva: Hi ${name}, RESCHEDULED ${shortDate} ${shortTime}. Dr ${doctor}. ${service}.`;
    case "Appointment Cancellation":
      return `DentaNueva: Hi ${name}, your ${shortDate} ${shortTime} appointment was CANCELLED. Contact DentaNueva to rebook.`;
    default:
      return `DentaNueva: Hi ${name}, clinic notification for ${shortDate} ${shortTime}.`;
  }
}
function removeUndeliveredReminderNotifications(appointmentId) {
  let changed = false;
  smsNotifications = smsNotifications.filter((notification) => {
    const isSameAppointment =
      notification.source === "appointment" &&
      String(notification.appointmentId || "") === String(appointmentId);
    const isReminder =
      notification.type === "Appointment Reminder" ||
      notification.type === "Same-Day Reminder";
    const isUnsent =
      notification.status === "Pending" || notification.status === "Failed";
    if (isSameAppointment && isReminder && isUnsent) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed;
}
function cleanupOrphanedNotifications() {
  if (!Array.isArray(smsNotifications) || !smsNotifications.length)
    return false;
  let changed = false;
  smsNotifications = smsNotifications.filter((notification) => {
    if (!notification) {
      changed = true;
      return false;
    }
    const notificationPatientId = notification.patientId || "";
    const notificationPatientName = notification.patientName || "";
    const matchedPatient = patients.some((patient) => {
      const patientId = getPatientId(patient);
      const patientName = getPatientName(patient);
      if (
        notificationPatientId &&
        patientId &&
        String(notificationPatientId) === String(patientId)
      )
        return true;
      if (
        notificationPatientName &&
        patientName &&
        String(notificationPatientName).trim().toLowerCase() ===
          String(patientName).trim().toLowerCase()
      )
        return true;
      return false;
    });
    if (!matchedPatient) {
      changed = true;
      return false;
    }
    if (notification.source === "appointment" && notification.appointmentId) {
      const appointmentStillExists = appointments.some(
        (appointment) =>
          String(getAppointmentId(appointment)) ===
          String(notification.appointmentId),
      );
      if (!appointmentStillExists) {
        changed = true;
        return false;
      }
    }
    return true;
  });
  return changed;
}
function findPatientForAppointment(appointment) {
  if (!appointment) return null;
  const appointmentPatientId =
    appointment.patientId ||
    appointment.patient_id ||
    appointment.patientID ||
    "";
  const appointmentPatientName =
    appointment.patient ||
    appointment.patientName ||
    appointment.patient_name ||
    appointment.fullName ||
    appointment.name ||
    "";
  if (appointmentPatientId) {
    const patientById = patients.find(
      (patient) =>
        String(getPatientId(patient)) === String(appointmentPatientId),
    );
    if (patientById) return patientById;
  }
  if (appointmentPatientName) {
    const normalizedName = String(appointmentPatientName).trim().toLowerCase();
    const patientByName = patients.find(
      (patient) =>
        String(getPatientName(patient)).trim().toLowerCase() === normalizedName,
    );
    if (patientByName) return patientByName;
  }
  return null;
}
async function processPendingSMSNotifications() {
  const remindersChanged = syncDueReminderNotifications();
  if (remindersChanged) {
    await saveSMSNotifications();
    await loadSMSNotifications();
  }
  const currentTime = Date.now();
  const pendingNotifications = smsNotifications.filter((notification) => {
    if (!notification) return false;
    if (String(notification.status || "").toLowerCase() !== "pending")
      return false;
    if (
      notification.type === "Appointment Reminder" ||
      notification.type === "Same-Day Reminder"
    ) {
      if (!notification.scheduledFor) return false;
      const scheduledTime = new Date(notification.scheduledFor).getTime();
      if (Number.isNaN(scheduledTime) || currentTime < scheduledTime)
        return false;
    }
    return true;
  });
  for (const notification of pendingNotifications) {
    await processSMSNotification(notification.id, false);
  }
}
function syncDueReminderNotifications() {
  if (!Array.isArray(appointments) || !appointments.length) return false;
  if (!Array.isArray(patients) || !patients.length) return false;
  let changed = false;
  appointments.forEach((appointment) => {
    if (!appointment) return;
    const status = getAppointmentStatus(appointment);
    if (status !== "scheduled") return;
    const appointmentId = getAppointmentId(appointment);
    if (!appointmentId) return;
    const patient = findPatientForAppointment(appointment);
    if (!patient) return;
    const appointmentDate = normalizeDateForInput(
      appointment.date ||
        appointment.appointmentDate ||
        appointment.scheduleDate ||
        appointment.dateOfAppointment ||
        "",
    );
    const appointmentTime = normalizeTimeForInput(
      appointment.start ||
        appointment.time ||
        appointment.appointmentTime ||
        appointment.scheduleTime ||
        "",
    );
    if (!appointmentDate || !appointmentTime) return;
    const reminderType = getReminderTypeForAppointment(
      appointmentDate,
      appointmentTime,
    );
    if (!reminderType) return;
    const reminderDueAt = getReminderDueAt(
      appointmentDate,
      appointmentTime,
      reminderType,
    );
    if (!reminderDueAt) return;
    const created = createAutomaticNotificationIfMissing(
      appointment,
      patient,
      reminderType,
      appointmentDate,
      appointmentTime,
      reminderDueAt.toISOString(),
    );
    if (created) changed = true;
  });
  return changed;
}
async function processSMSNotification(notificationId, isRetry = false) {
  const notification = smsNotifications.find(
    (item) => String(item.id) === String(notificationId),
  );
  if (!notification) return;
  refreshNotificationPatientContact(notification);
  if (notification.status !== "Pending" && !isRetry) return;
  if (smsProcessingIds.has(String(notificationId))) return;
  if (
    notification.type === "Appointment Reminder" ||
    notification.type === "Same-Day Reminder"
  ) {
    if (!notification.scheduledFor) return;
    const scheduledTime = new Date(notification.scheduledFor).getTime();
    if (Number.isNaN(scheduledTime) || Date.now() < scheduledTime) return;
  }
  smsProcessingIds.add(String(notificationId));
  notification.status = "Processing";
  notification.deliveryStatus = "Processing";
  notification.failureReason = null;
  renderPage();
  const channel =
    String(notification.channel || "email").toLowerCase() === "sms"
      ? "sms"
      : "email";
  const channelLabel = channel === "sms" ? "SMS" : "Email";
  try {
    const data = await sendSMSNotification(notification);
    if (data?.data?.alreadyProcessed && data?.data?.status === "Processing") {
      notification.status = "Processing";
      notification.deliveryStatus = "Processing";
      notification.failureReason = null;
      renderPage();
      showToast(`${channelLabel} is already being sent.`, "i");
      return;
    }
    if (data?.data?.alreadyProcessed && data?.data?.status === "Sent") {
      notification.status = "Sent";
      notification.deliveryStatus = "Sent";
      notification.sentAt = new Date().toISOString();
      notification.failedAt = null;
      notification.failureReason = null;
      renderPage();
      showToast(`${channelLabel} was already sent.`, "i");
      return;
    }
    if (channel === "sms") {
      const providerStatus = String(
        data?.data?.provider_status || data?.data?.status || "",
      )
        .trim()
        .toLowerCase();
      if (providerStatus === "sent" || providerStatus === "delivered") {
        notification.status = "Sent";
        notification.deliveryStatus = "Sent";
        notification.sentAt = new Date().toISOString();
        notification.failedAt = null;
        notification.failureReason = null;
        renderPage();
        showToast("SMS sent successfully.");
        return;
      }
      notification.status = "Processing";
      notification.deliveryStatus = "Processing";
      notification.sentAt = null;
      notification.failedAt = null;
      notification.failureReason = null;
      renderPage();
      showToast("SMS accepted by SkySMS and awaiting delivery status.", "i");
      return;
    }
    notification.status = "Sent";
    notification.deliveryStatus = "Sent";
    notification.sentAt = new Date().toISOString();
    notification.failedAt = null;
    notification.failureReason = null;
    renderPage();
    showToast("Email sent successfully.");
  } catch (error) {
    const reason = error?.message || `${channelLabel} delivery failed.`;
    notification.status = "Failed";
    notification.deliveryStatus = "Failed";
    notification.failedAt = new Date().toISOString();
    notification.sentAt = null;
    notification.failureReason = reason;
    renderPage();
    showToast(`${channelLabel} failed to send.`, "!");
  } finally {
    smsProcessingIds.delete(String(notificationId));
    await loadSMSNotifications();
    renderPage();
  }
}
async function syncSMSDeliveryStatuses() {
  try {
    const response = await fetch("sms_notifications.php?action=sms_status");
    const data = await response.json();
    if (!data.success) {
      console.error(data.message || "Unable to synchronize SMS statuses.");
      return false;
    }
    return Number(data?.data?.updated || 0) > 0;
  } catch (error) {
    console.error("Unable to synchronize SMS statuses:", error);
    return false;
  }
}
function sendSMSNotification(notification) {
  const channel =
    String(notification.channel || "email").toLowerCase() === "sms"
      ? "sms"
      : "email";
  const payload = {
    id: notification.id,
    channel,
    subject: notification.subject,
    message: notification.message,
  };
  if (channel === "sms") {
    payload.phone = notification.phone;
  } else {
    payload.email = notification.email;
  }
  return fetch("sms_notifications.php?action=send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        const label =
          channel === "sms" ? "SMS delivery failed." : "Email delivery failed.";
        throw new Error(data.message || label);
      }
      return data;
    });
}
async function retrySMSNotification(notificationId) {
  const notification = smsNotifications.find(
    (item) => String(item.id) === String(notificationId),
  );
  if (!notification) return;
  if (notification.status !== "Failed") return;
  if (
    notification.type === "Appointment Reminder" ||
    notification.type === "Same-Day Reminder"
  ) {
    if (!notification.scheduledFor) return;
    const scheduledTime = new Date(notification.scheduledFor).getTime();
    if (Number.isNaN(scheduledTime) || Date.now() < scheduledTime) return;
  }
  notification.status = "Pending";
  notification.deliveryStatus = "Pending";
  notification.failedAt = null;
  notification.failureReason = null;
  await saveSMSNotifications();
  await loadSMSNotifications();
  renderPage();
  showToast("Retry started.");
  await processSMSNotification(notification.id, true);
}
function updateSMSDeliveryStatus(notificationId, status, failureReason = null) {
  const notification = smsNotifications.find(
    (item) => String(item.id) === String(notificationId),
  );
  if (!notification) return false;
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();
  if (normalizedStatus === "sent") {
    notification.status = "Sent";
    notification.deliveryStatus = "Sent";
    notification.sentAt = new Date().toISOString();
    notification.failedAt = null;
    notification.failureReason = null;
  } else if (normalizedStatus === "failed") {
    notification.status = "Failed";
    notification.deliveryStatus = "Failed";
    notification.failedAt = new Date().toISOString();
    notification.sentAt = null;
    notification.failureReason =
      failureReason ||
      (String(notification.channel || "email").toLowerCase() === "sms"
        ? "SMS delivery failed."
        : "Email delivery failed.");
  } else {
    notification.status = "Pending";
    notification.deliveryStatus = "Pending";
    notification.sentAt = null;
    notification.failedAt = null;
    notification.failureReason = null;
  }
  saveSMSNotifications();
  renderPage();
  return true;
}
function renderPage() {
  renderNotifications();
}
function getVisibleNotifications() {
  return smsNotifications.filter(
    (notification) => !isFutureScheduledReminder(notification),
  );
}
function updateStatsSummary(visibleNotifications) {
  const totalEl = document.getElementById("statTotal");
  const sentEl = document.getElementById("statSent");
  const pendingEl = document.getElementById("statPending");
  const failedEl = document.getElementById("statFailed");
  if (!totalEl && !sentEl && !pendingEl && !failedEl) return;
  let sent = 0;
  let pending = 0;
  let failed = 0;
  visibleNotifications.forEach((notification) => {
    const status = String(notification.status || "");
    if (status === "Sent") sent++;
    else if (status === "Failed") failed++;
    else pending++;
  });
  if (totalEl) totalEl.textContent = visibleNotifications.length;
  if (sentEl) sentEl.textContent = sent;
  if (pendingEl) pendingEl.textContent = pending;
  if (failedEl) failedEl.textContent = failed;
}
function renderNotifications() {
  const tableBody = document.getElementById("notificationTableBody");
  const emptyState = document.getElementById("emptyState");
  const recordCount = document.getElementById("recordCount");
  if (!tableBody) return;
  updateStatsSummary(getVisibleNotifications());
  const filtered = getFilteredNotifications();
  const sorted = sortSMSNotifications(filtered);
  const totalItems = sorted.length;
  const totalPages = Math.max(Math.ceil(totalItems / SMS_PAGE_SIZE), 1);
  if (smsCurrentPage > totalPages) smsCurrentPage = totalPages;
  if (smsCurrentPage < 1) smsCurrentPage = 1;
  const startIndex = (smsCurrentPage - 1) * SMS_PAGE_SIZE;
  const pageItems = sorted.slice(startIndex, startIndex + SMS_PAGE_SIZE);
  tableBody.innerHTML = "";
  if (recordCount) recordCount.textContent = totalItems;
  renderPagination(totalItems, totalPages);
  if (!sorted.length) {
    emptyState?.classList.add("show");
    return;
  }
  emptyState?.classList.remove("show");
  pageItems.forEach((notification) => {
    const row = document.createElement("tr");
    row.innerHTML = createNotificationRow(notification);
    tableBody.appendChild(row);
  });
}
function renderPagination(totalItems, totalPages) {
  const paginationBar = document.getElementById("paginationBar");
  const paginationSummary = document.getElementById("paginationSummary");
  const paginationPageInfo = document.getElementById("paginationPageInfo");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  if (
    !paginationBar ||
    !paginationSummary ||
    !paginationPageInfo ||
    !prevPageBtn ||
    !nextPageBtn
  )
    return;
  if (totalItems <= SMS_PAGE_SIZE) {
    paginationBar.style.display = "none";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    return;
  }
  paginationBar.style.display = "flex";
  const startItem = (smsCurrentPage - 1) * SMS_PAGE_SIZE + 1;
  const endItem = Math.min(smsCurrentPage * SMS_PAGE_SIZE, totalItems);
  paginationSummary.textContent = `Showing ${startItem}–${endItem} of ${totalItems} notifications`;
  paginationPageInfo.textContent = `Page ${smsCurrentPage} of ${totalPages}`;
  prevPageBtn.disabled = smsCurrentPage <= 1;
  nextPageBtn.disabled = smsCurrentPage >= totalPages;
}
function createNotificationRow(notification) {
  const initials = getInitials(notification.patientName);
  const statusClass = getStatusClass(notification.status);
  const typeClass = getTypeClass(notification.type);
  const appointmentDate = notification.appointmentDate
    ? formatDate(notification.appointmentDate)
    : "Not specified";
  const appointmentTime = notification.appointmentTime
    ? formatTime(notification.appointmentTime)
    : "Not specified";
  const message = notification.message || "";
  const preview =
    message.length > 85 ? message.substring(0, 85) + "..." : message;
  const isProcessing = smsProcessingIds.has(String(notification.id));
  const channel =
    String(notification.channel || "email").toLowerCase() === "sms"
      ? "SMS"
      : "EMAIL";
  const contact = channel === "SMS" ? notification.phone : notification.email;
  const contactHTML = contact
    ? `<span class="contact-cell"><span class="contact-line" title="${escapeAttribute(contact)}">${escapeHTML(contact)}</span></span>`
    : "-";
  let menuItems = `<button class="action-menu-item" type="button" data-action="view" data-id="${escapeAttribute(notification.id)}"><i class="fa-solid fa-eye"></i><span>View</span></button>`;
  if (notification.status === "Failed") {
    menuItems += `<button class="action-menu-item retry" type="button" data-action="retry" data-id="${escapeAttribute(notification.id)}"><i class="fa-solid fa-rotate-right"></i><span>Retry</span></button>`;
  }
  menuItems += `<button class="action-menu-item delete" type="button" data-action="delete" data-id="${escapeAttribute(notification.id)}"><i class="fa-solid fa-trash"></i><span>Delete</span></button>`;
  const actions = `<div class="action-menu"><button class="action-menu-trigger" type="button" aria-label="Notification actions" data-menu-trigger="true"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="action-menu-dropdown">${menuItems}</div></div>`;
  return `<td><div class="patient-cell"><div class="patient-avatar">${escapeHTML(initials)}</div><div class="patient-info"><div class="patient-name">${escapeHTML(notification.patientName)}</div><div class="patient-id">${escapeHTML(notification.patientId || "No ID")}</div></div></div></td><td>${contactHTML}</td><td class="message-cell"><div class="message-preview" title="${escapeAttribute(message)}">${escapeHTML(preview)}</div></td><td><span class="type-badge ${typeClass}">${escapeHTML(notification.type || "-")}</span></td><td><div class="appointment-cell"><strong>${escapeHTML(appointmentDate)}</strong><span>${escapeHTML(appointmentTime)}</span></div></td><td><span class="status-badge ${statusClass}"><span class="status-dot"></span>${escapeHTML(isProcessing ? "Sending..." : notification.status)}</span></td><td><div class="action-buttons">${actions}</div></td>`;
}
function isFutureScheduledReminder(notification) {
  if (!notification) return false;
  const isReminder =
    notification.type === "Appointment Reminder" ||
    notification.type === "Same-Day Reminder";
  if (!isReminder) return false;
  if (notification.status === "Sent" || notification.status === "Failed")
    return false;
  if (!notification.scheduledFor) return true;
  const scheduledTime = new Date(notification.scheduledFor).getTime();
  if (Number.isNaN(scheduledTime)) return true;
  return Date.now() < scheduledTime;
}
function getFilteredNotifications() {
  const search =
    document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const status = document.getElementById("statusFilter")?.value || "all";
  const type = document.getElementById("typeFilter")?.value || "all";
  return smsNotifications.filter((notification) => {
    if (isFutureScheduledReminder(notification)) return false;
    const patientName = String(notification.patientName || "").toLowerCase();
    const phone = String(notification.phone || "").toLowerCase();
    const email = String(notification.email || "").toLowerCase();
    const notificationStatus = String(notification.status || "");
    const notificationType = String(notification.type || "");
    const searchMatch =
      !search ||
      patientName.includes(search) ||
      phone.includes(search) ||
      email.includes(search);
    const statusMatch = status === "all" || notificationStatus === status;
    const typeMatch = type === "all" || notificationType === type;
    return searchMatch && statusMatch && typeMatch;
  });
}
function handleTableAction(event) {
  const menuTrigger = event.target.closest("[data-menu-trigger]");
  if (menuTrigger) {
    event.stopPropagation();
    const menu = menuTrigger.closest(".action-menu");
    if (!menu) return;
    document.querySelectorAll(".action-menu.open").forEach((item) => {
      if (item !== menu) item.classList.remove("open");
    });
    menu.classList.toggle("open");
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  const menu = button.closest(".action-menu");
  if (menu) menu.classList.remove("open");
  if (action === "view") viewNotification(id);
  if (action === "retry") retrySMSNotification(id);
  if (action === "delete") openDeleteModal(id);
}
function viewNotification(id) {
  const notification = smsNotifications.find(
    (item) => String(item.id) === String(id),
  );
  if (!notification) return;
  refreshNotificationPatientContact(notification);
  const details = document.getElementById("notificationDetails");
  if (!details) return;
  const channel =
    String(notification.channel || "email").toLowerCase() === "sms"
      ? "SMS"
      : "Email";
  details.innerHTML = `<div class="detail-row"><div class="detail-label">Patient</div><div class="detail-value">${escapeHTML(notification.patientName)}</div></div><div class="detail-row"><div class="detail-label">Patient ID</div><div class="detail-value">${escapeHTML(notification.patientId || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Channel</div><div class="detail-value">${channel}</div></div><div class="detail-row"><div class="detail-label">Email</div><div class="detail-value">${escapeHTML(notification.email || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Phone</div><div class="detail-value">${escapeHTML(notification.phone || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Doctor</div><div class="detail-value">${escapeHTML(notification.doctorName || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Service</div><div class="detail-value">${escapeHTML(notification.service || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Appointment Date</div><div class="detail-value">${notification.appointmentDate ? escapeHTML(formatDate(notification.appointmentDate)) : "Date not specified"}</div></div><div class="detail-row"><div class="detail-label">Start Time</div><div class="detail-value">${notification.appointmentTime ? escapeHTML(formatTime(notification.appointmentTime)) : "Time not specified"}</div></div><div class="detail-row"><div class="detail-label">End Time</div><div class="detail-value">${notification.appointmentEndTime ? escapeHTML(formatTime(notification.appointmentEndTime)) : "Not specified"}</div></div><div class="detail-row"><div class="detail-label">Duration</div><div class="detail-value">${notification.duration ? escapeHTML(`${notification.duration} minutes`) : "Not specified"}</div></div><div class="detail-row"><div class="detail-label">Notification Type</div><div class="detail-value">${escapeHTML(notification.type || "Not specified")}</div></div><div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${escapeHTML(notification.status)}</div></div><div class="detail-row"><div class="detail-label">Source</div><div class="detail-value">${notification.source === "appointment" ? "Automatic Appointment Workflow" : "Manual"}</div></div>${notification.scheduledFor ? `<div class="detail-row"><div class="detail-label">Scheduled For</div><div class="detail-value">${formatDateTime(notification.scheduledFor)}</div></div>` : ""}<div class="detail-row"><div class="detail-label">Message</div><div class="detail-value">${escapeHTML(notification.message || "")}</div></div><div class="detail-row"><div class="detail-label">Created</div><div class="detail-value">${formatDateTime(notification.createdAt)}</div></div><div class="detail-row"><div class="detail-label">Sent At</div><div class="detail-value">${notification.sentAt ? formatDateTime(notification.sentAt) : "Not processed"}</div></div>${notification.failedAt ? `<div class="detail-row"><div class="detail-label">Failed At</div><div class="detail-value">${formatDateTime(notification.failedAt)}</div></div>` : ""}${notification.failureReason ? `<div class="detail-row"><div class="detail-label">Failure Reason</div><div class="detail-value">${escapeHTML(notification.failureReason)}</div></div>` : ""}`;
  openModal("viewModal");
}
function openDeleteModal(id) {
  deleteNotificationId = id;
  openModal("deleteModal");
}
async function confirmDelete() {
  if (!deleteNotificationId) return;
  const notificationId = deleteNotificationId;
  try {
    const response = await fetch("sms_notifications.php?action=delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notificationId }),
    });
    const data = await response.json();
    if (!data.success)
      throw new Error(data.message || "Unable to delete notification.");
    const deletedNotification = smsNotifications.find(
      (item) => String(item.id) === String(notificationId),
    );
    if (
      deletedNotification?.source === "appointment" &&
      deletedNotification.appointmentId
    ) {
      const deletedKey = getAutomaticNotificationKey(
        deletedNotification.appointmentId,
        deletedNotification.type,
        String(deletedNotification.channel || "email").toLowerCase(),
        deletedNotification.appointmentDate || "",
        deletedNotification.appointmentTime || "",
      );
      suppressedAutomaticNotifications.add(deletedKey);
    }
    smsNotifications = smsNotifications.filter(
      (item) => String(item.id) !== String(notificationId),
    );
    closeModal("deleteModal");
    deleteNotificationId = null;
    renderPage();
    showToast("Notification deleted.");
  } catch (error) {
    showToast(error.message || "Unable to delete notification.", "!");
  }
}
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("show");
}
function closeModal(id) {
  if (id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("show");
    return;
  }
  document
    .querySelectorAll(".modal-overlay")
    .forEach((modal) => modal.classList.remove("show"));
}
function bindEvents() {
  document
    .getElementById("closeViewModalBtn")
    ?.addEventListener("click", () => closeModal("viewModal"));
  document
    .getElementById("closeDetailsBtn")
    ?.addEventListener("click", () => closeModal("viewModal"));
  document
    .getElementById("cancelDeleteBtn")
    ?.addEventListener("click", () => closeModal("deleteModal"));
  document
    .getElementById("confirmDeleteBtn")
    ?.addEventListener("click", confirmDelete);
  document.getElementById("searchInput")?.addEventListener("input", () => {
    smsCurrentPage = 1;
    renderNotifications();
  });
  document.getElementById("statusFilter")?.addEventListener("change", () => {
    smsCurrentPage = 1;
    renderNotifications();
  });
  document.getElementById("typeFilter")?.addEventListener("change", () => {
    smsCurrentPage = 1;
    renderNotifications();
  });
  document.getElementById("prevPageBtn")?.addEventListener("click", () => {
    if (smsCurrentPage > 1) {
      smsCurrentPage--;
      renderNotifications();
    }
  });
  document.getElementById("nextPageBtn")?.addEventListener("click", () => {
    const filtered = getFilteredNotifications();
    const totalPages = Math.max(Math.ceil(filtered.length / SMS_PAGE_SIZE), 1);
    if (smsCurrentPage < totalPages) {
      smsCurrentPage++;
      renderNotifications();
    }
  });
  document
    .getElementById("notificationTableBody")
    ?.addEventListener("click", handleTableAction);
  document.addEventListener("click", (event) => {
    if (event.target.closest(".action-menu")) return;
    document
      .querySelectorAll(".action-menu.open")
      .forEach((menu) => menu.classList.remove("open"));
  });
  document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.remove("show");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}
function createID() {
  return "SMS-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
}
function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function getStatusClass(status) {
  if (status === "Sent") return "status-sent";
  if (status === "Failed") return "status-failed";
  return "status-pending";
}
function getTypeClass(type) {
  switch (type) {
    case "Appointment Confirmation":
      return "confirmation";
    case "Appointment Reminder":
      return "reminder";
    case "Same-Day Reminder":
      return "same-day";
    case "Appointment Reschedule":
      return "reschedule";
    case "Appointment Cancellation":
      return "cancellation";
    default:
      return "";
  }
}
function normalizeDateForInput(date) {
  if (!date) return "";
  const value = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return (
    parsed.getFullYear() +
    "-" +
    String(parsed.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(parsed.getDate()).padStart(2, "0")
  );
}
function normalizeTimeForInput(time) {
  if (!time) return "";
  const value = String(time).trim();
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.substring(0, 5);
  const twelveHourMatch = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minute = twelveHourMatch[2];
    const suffix = twelveHourMatch[3].toUpperCase();
    if (suffix === "PM" && hour !== 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    return String(hour).padStart(2, "0") + ":" + minute;
  }
  const parsed = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) return "";
  return (
    String(parsed.getHours()).padStart(2, "0") +
    ":" +
    String(parsed.getMinutes()).padStart(2, "0")
  );
}
function formatDate(date) {
  const normalized = normalizeDateForInput(date);
  if (!normalized) return "Date not specified";
  const parts = normalized.split("-");
  const dateObject = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
  );
  return dateObject.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(time) {
  if (!time) return "Time not specified";
  const normalized = normalizeTimeForInput(time);
  if (!normalized) return "Time not specified";
  const parts = normalized.split(":");
  let hour = Number(parts[0]);
  const minute = parts[1];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}
function formatDateTime(value) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttribute(value) {
  return escapeHTML(value);
}
function showToast(message, icon = "✓") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");
  if (!toast || !toastMessage || !toastIcon) return;
  if (icon === "!")
    toastIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
  else if (icon === "i")
    toastIcon.innerHTML = '<i class="fa-solid fa-info"></i>';
  else toastIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
  toastMessage.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
setInterval(async () => {
  if (smsRefreshInProgress) return;
  smsRefreshInProgress = true;
  try {
    await loadAppointments();
    await loadPatients();
    await loadSMSNotifications();
    await loadSuppressedAutomaticNotifications();
    const cleanupChanged = cleanupOrphanedNotifications();
    const notificationsChanged = syncAppointmentNotifications();
    if (cleanupChanged || notificationsChanged) {
      await saveSMSNotifications();
      await loadSMSNotifications();
    }
    await processPendingSMSNotifications();
    await syncSMSDeliveryStatuses();
    await loadSMSNotifications();
    renderPage();
  } finally {
    smsRefreshInProgress = false;
  }
}, 60000);
