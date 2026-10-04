(() => {
  "use strict";
  const API = "../../api/appointments.php";
  async function request(options = {}, url = API) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Appointment request failed.");
    }
    return result.data;
  }
  async function attachBookingRestriction(data) {
    if (!Array.isArray(data)) return data;
    try {
      const restriction = await request({}, `${API}?scope=booking_restriction`);
      Object.defineProperty(data, "__bookingRestriction", {
        value: restriction || {},
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch (error) {
      Object.defineProperty(data, "__bookingRestriction", {
        value: {},
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    return data;
  }
  window.DentaNuevaAppointmentDatabase = Object.freeze({
    async load(params = {}) {
      const url = new URL(API, window.location.href);
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        url.searchParams.set(key, String(value));
      });
      const data = (await request({ method: "GET" }, url)) || [];
      if (!params.scope) {
        return attachBookingRestriction(data);
      }
      return data;
    },
    async save(appointments) {
      const data = await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointments }),
      });
      return attachBookingRestriction(data);
    },
    async reschedule(appointment) {
      const data = await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reschedule: appointment }),
      });
      return attachBookingRestriction(data);
    },
    async remove(id) {
      return request({
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    },
    async loadRescheduleRequests() {
      return (await request({}, `${API}?scope=reschedule_requests`)) || [];
    },
    async saveRescheduleRequests(requests) {
      return request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reschedule_requests: requests }),
      });
    },
  });
})();
