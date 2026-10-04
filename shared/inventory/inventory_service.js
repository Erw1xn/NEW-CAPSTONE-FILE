(() => {
  "use strict";

  const API_ENDPOINT = "../../api/inventory.php";
  const ITEMS_KEY = "dentanueva_inventory_items";
  const MOVEMENTS_KEY = "dentanueva_inventory_movements";
  const NOTIFICATIONS_KEY = "dentanueva_inventory_notifications";

  let cachedItems = [];
  let cachedMovements = [];
  let inMemoryNotifications = [];

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function normalizeItem(row) {
    return {
      id: String(row?.id ?? row?.item_id ?? ""),
      item_id: row?.item_id ?? row?.id ?? "",
      name: String(row?.name ?? row?.itemName ?? row?.item_name ?? ""),
      category: String(row?.category ?? "Other"),
      unit: String(row?.unit ?? "unit"),
      stock: Number(row?.stock ?? row?.stock_quantity ?? 0),
      minimum: Number(row?.minimum ?? row?.reorder_level ?? 0),
      expiry: row?.expiry ?? row?.expiry_date ?? "",
      updatedAt: row?.updatedAt ?? row?.updated_at ?? new Date().toISOString(),
    };
  }

  async function fetchInventoryFromBackend() {
    try {
      const response = await fetch(`${API_ENDPOINT}?action=list`, {
        method: "GET",
        credentials: "same-origin",
      });
      const result = await response.json();

      if (!result?.success) {
        return { items: [], movements: [] };
      }

      const items = Array.isArray(result?.data?.items)
        ? result.data.items.map(normalizeItem)
        : [];
      const movements = Array.isArray(result?.data?.movements)
        ? result.data.movements
        : [];

      cachedItems = items;
      cachedMovements = movements;
      window[ITEMS_KEY] = items;
      window[MOVEMENTS_KEY] = movements;
      return { items, movements };
    } catch (error) {
      console.error("Unable to load inventory from backend:", error);
      return { items: [], movements: [] };
    }
  }

  function readLocalInventoryFallback(storageKey) {
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function getCachedItems() {
    if (Array.isArray(cachedItems) && cachedItems.length) {
      return cachedItems;
    }
    if (Array.isArray(window[ITEMS_KEY]) && window[ITEMS_KEY].length) {
      cachedItems = window[ITEMS_KEY];
      return cachedItems;
    }
    const fallback = readLocalInventoryFallback(ITEMS_KEY);
    cachedItems = fallback;
    return cachedItems;
  }

  function getCachedMovements() {
    if (Array.isArray(cachedMovements) && cachedMovements.length) {
      return cachedMovements;
    }
    if (Array.isArray(window[MOVEMENTS_KEY]) && window[MOVEMENTS_KEY].length) {
      cachedMovements = window[MOVEMENTS_KEY];
      return cachedMovements;
    }
    const fallback = readLocalInventoryFallback(MOVEMENTS_KEY);
    cachedMovements = fallback;
    return cachedMovements;
  }

  function getTreatmentMaterials(procedure) {
    const materials = window.DentaNuevaTreatmentMaterials || {};
    return materials[normalizeName(procedure)] || [];
  }

  function getTreatmentMaterialSuggestions(procedure) {
    const items = getCachedItems();

    return getTreatmentMaterials(procedure).map((material) => {
      const item = items.find((candidate) =>
        material.names.some(
          (name) => normalizeName(candidate.name) === normalizeName(name),
        ),
      );

      return {
        itemId: item?.id || "",
        itemName: item?.name || material.names[0],
        quantity: Number(material.quantity) || 0,
        available: Number(item?.stock) || 0,
        unit: item?.unit || "unit",
        missing: !item,
      };
    });
  }

  function getPatientName(patient) {
    const fullName = [
      patient?.firstName,
      patient?.middleName,
      patient?.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    return fullName || patient?.name || patient?.patientId || "Patient";
  }

  function saveTreatmentNotification(
    treatment,
    patient,
    movements,
    unresolvedMaterials = [],
  ) {
    if (!movements.length && !unresolvedMaterials.length) {
      return;
    }

    inMemoryNotifications.unshift({
      id: `INV-NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: "clinical-treatment-inventory-update",
      patientName: getPatientName(patient),
      patientId: treatment.patientId || "",
      procedure: treatment.procedure || "Treatment",
      toothNumber: treatment.toothNumber || treatment.tooth || "",
      treatmentDate: treatment.date || "",
      appointmentId: treatment.appointmentId || "",
      items: [
        ...movements.map((movement) => ({
          itemName: movement.itemName,
          quantity: movement.quantity,
          unit: movement.unit || "unit",
          previousStock: movement.previousStock,
          newStock: movement.newStock,
          status: "stock-out-completed",
        })),
        ...unresolvedMaterials.map((material) => ({
          itemName: material.itemName,
          quantity: material.quantity,
          unit: material.unit || "unit",
          available: material.available,
          status: material.status,
        })),
      ],
      createdAt: new Date().toISOString(),
    });

    window.dispatchEvent(new CustomEvent("inventory:notification-created"));
  }

  async function recordTreatmentDeduction(
    treatment,
    patient,
    requestedMaterials,
  ) {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "deduct_for_treatment",
          treatment,
          patient,
          requestedMaterials,
        }),
      });

      const result = await response.json();

      if (!result?.success) {
        return {
          success: false,
          message: result?.message || "Inventory deduction failed.",
          movements: [],
          unresolvedMaterials: [],
        };
      }

      const movements = Array.isArray(result?.data?.movements)
        ? result.data.movements
        : [];
      const unresolvedMaterials = Array.isArray(
        result?.data?.unresolvedMaterials,
      )
        ? result.data.unresolvedMaterials
        : [];

      if (movements.length || unresolvedMaterials.length) {
        saveTreatmentNotification(
          treatment,
          patient,
          movements,
          unresolvedMaterials,
        );
      }

      cachedItems = [];
      cachedMovements = [];
      await fetchInventoryFromBackend();
      window.dispatchEvent(new CustomEvent("inventory:data-changed"));

      return {
        success: true,
        movements,
        unresolvedMaterials,
      };
    } catch (error) {
      console.error("Treatment inventory deduction failed:", error);
      return {
        success: false,
        message: "Unable to update inventory in the database.",
        movements: [],
        unresolvedMaterials: [],
      };
    }
  }

  function deductForTreatment(treatment, patient, requestedMaterials) {
    return recordTreatmentDeduction(treatment, patient, requestedMaterials);
  }

  window.DentaNuevaInventoryService = Object.freeze({
    ITEMS_KEY,
    MOVEMENTS_KEY,
    NOTIFICATIONS_KEY,
    getTreatmentMaterials,
    getTreatmentMaterialSuggestions,
    deductForTreatment,
    refreshInventoryFromBackend: fetchInventoryFromBackend,
  });

  fetchInventoryFromBackend();
})();
