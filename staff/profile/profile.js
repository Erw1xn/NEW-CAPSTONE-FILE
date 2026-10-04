document.addEventListener("DOMContentLoaded", () => {
  loadProfileModal();
});

let profileSuccessTimeout = null;
let currentStaffData = null;

async function loadProfileModal() {
  const existingModal = document.getElementById("profileModalBackdrop");

  if (existingModal) {
    initProfileLogic();
    await loadStaffProfile();
    return;
  }

  try {
    const response = await fetch("../profile/profile.html");

    if (!response.ok) {
      throw new Error("Unable to load profile modal.");
    }

    const html = await response.text();
    const tempDiv = document.createElement("div");

    tempDiv.innerHTML = html;

    const modal = tempDiv.querySelector("#profileModalBackdrop");

    if (!modal) {
      throw new Error("Profile modal markup was not found.");
    }

    document.body.appendChild(modal);
    initProfileLogic();
    await loadStaffProfile();
  } catch (error) {
    console.error("Failed to load profile modal:", error);
  }
}

async function loadStaffProfile() {
  try {
    const response = await fetch("../profile/profile.php", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "../../login/login.html";
      return null;
    }
    if (!response.ok) {
      throw new Error("Unable to load staff profile.");
    }
    const data = await response.json();
    if (!data.success || !data.user) {
      window.location.href = "../../login/login.html";
      return null;
    }
    currentStaffData = data.user;
    updateSidebarProfile(currentStaffData);
    return currentStaffData;
  } catch (error) {
    console.error("Failed to load staff profile:", error);
    return null;
  }
}

function getCurrentUser() {
  return currentStaffData;
}

function getStaffData() {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return {
      name: "Staff",
      initials: "ST",
      image: "",
      role: "Staff",
      department: "Clinic Operations",
      staffId: "No staff ID available",
      accessLevel: "Staff",
      email: "",
      contact: "",
      status: "Active",
    };
  }

  const firstname = currentUser.firstname || currentUser.firstName || "";
  const lastname = currentUser.lastname || currentUser.lastName || "";

  const name =
    currentUser.name ||
    currentUser.full_name ||
    `${firstname} ${lastname}`.trim() ||
    "Staff";

  return {
    name: name,
    initials: getInitials(name),
    image:
      currentUser.profileImage ||
      currentUser.profile_image ||
      currentUser.image ||
      "",
    role: currentUser.role || "Staff",
    department: currentUser.department || "Clinic Operations",
    staffId:
      currentUser.staffId || currentUser.staff_id || "No staff ID available",
    accessLevel:
      currentUser.accessLevel ||
      currentUser.access_level ||
      currentUser.role ||
      "Staff",
    email: currentUser.email || "",
    contact:
      currentUser.contact ||
      currentUser.contactNumber ||
      currentUser.contact_number ||
      "",
    status: currentUser.status || "Active",
  };
}

async function saveStaffData(data) {
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return false;
  }

  const updatedUser = {
    ...currentUser,
    contact: data.contact,
  };

  try {
    const formData = new FormData();
    formData.append("action", "update_profile");
    formData.append("contact", data.contact || "");
    const response = await fetch("../profile/profile.php", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "../../login/login.html";
      return false;
    }
    const result = await response.json();
    if (!response.ok || !result.success || !result.user) {
      return false;
    }
    currentStaffData = result.user;
    return true;
  } catch (error) {
    console.error("Failed to save profile:", error);
    return false;
  }
}

function getInitials(name) {
  if (!name) {
    return "ST";
  }

  const cleanName = String(name).trim();

  if (!cleanName) {
    return "ST";
  }

  const parts = cleanName.split(/\s+/);

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function populateProfileModal(staff) {
  const nameEl = document.getElementById("profileModalName");
  const roleEl = document.getElementById("profileModalRole");
  const statusEl = document.getElementById("profileModalStatus");
  const staffIdCardEl = document.getElementById("profileModalStaffIdCard");
  const departmentEl = document.getElementById("profileModalDepartment");
  const accessLevelEl = document.getElementById("profileModalAccessLevel");
  const emailEl = document.getElementById("profileModalEmail");
  const contactEl = document.getElementById("profileModalContact");
  const contactInput = document.getElementById("profileModalContactInput");
  const imageEl = document.getElementById("profileModalImage");
  const initialsEl = document.getElementById("profileModalInitials");

  if (nameEl) {
    nameEl.textContent = staff.name;
  }

  if (roleEl) {
    roleEl.textContent = staff.role;
  }

  if (statusEl) {
    statusEl.textContent = staff.status;
  }

  if (staffIdCardEl) {
    staffIdCardEl.textContent = staff.staffId;
  }

  if (departmentEl) {
    departmentEl.textContent = staff.department;
  }

  if (accessLevelEl) {
    accessLevelEl.textContent = staff.accessLevel;
  }

  if (emailEl) {
    emailEl.textContent = staff.email || "No email available";
  }

  if (contactEl) {
    contactEl.textContent = staff.contact || "No contact number available";
  }

  if (contactInput) {
    contactInput.value = staff.contact || "";
  }

  if (imageEl && initialsEl) {
    const initials = getInitials(staff.name);

    if (staff.image) {
      imageEl.src = staff.image;
      imageEl.style.display = "block";
      initialsEl.textContent = initials;
      initialsEl.style.display = "none";
    } else {
      imageEl.removeAttribute("src");
      imageEl.style.display = "none";
      initialsEl.textContent = initials;
      initialsEl.style.display = "flex";
    }
  }

  clearProfileValidation();
}

function updateSidebarProfile(staff) {
  const nameEl = document.getElementById("activeStaffName");
  const imageEl = document.getElementById("activeStaffImage");
  const initialsEl = document.getElementById("activeStaffInitials");

  if (nameEl) {
    nameEl.textContent = staff.name;
  }

  if (!imageEl || !initialsEl) {
    return;
  }

  if (staff.image) {
    imageEl.src = staff.image;
    imageEl.style.display = "block";
    initialsEl.textContent = getInitials(staff.name);
    initialsEl.style.display = "none";
  } else {
    imageEl.removeAttribute("src");
    imageEl.style.display = "none";
    initialsEl.textContent = getInitials(staff.name);
    initialsEl.style.display = "flex";
  }
}

async function openProfileModal() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    console.error("profileModalBackdrop was not found.");
    return;
  }

  const card = backdrop.querySelector(".profile-modal-card");
  const staffData = await loadStaffProfile();
  if (!staffData) {
    return;
  }
  const staff = getStaffData();

  populateProfileModal(staff);
  updateSidebarProfile(staff);

  if (card) {
    card.classList.remove("editing");
  }

  clearProfileValidation();
  hideProfileSaveSuccess();

  backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeProfileModal() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    return;
  }

  const card = backdrop.querySelector(".profile-modal-card");

  if (card) {
    card.classList.remove("editing");
  }

  backdrop.classList.remove("active");

  clearProfileValidation();
  hideProfileSaveSuccess();

  document.body.style.overflow = "";
}

function startProfileEditing() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    return;
  }

  const card = backdrop.querySelector(".profile-modal-card");
  const contactInput = document.getElementById("profileModalContactInput");

  if (!card || !contactInput) {
    return;
  }

  const staff = getStaffData();

  contactInput.value = staff.contact || "";

  clearProfileValidation();
  hideProfileSaveSuccess();

  card.classList.add("editing");

  setTimeout(() => {
    contactInput.focus();
  }, 50);
}

function cancelProfileEditing() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    return;
  }

  const card = backdrop.querySelector(".profile-modal-card");

  if (!card) {
    return;
  }

  const staff = getStaffData();

  populateProfileModal(staff);
  card.classList.remove("editing");

  clearProfileValidation();
  hideProfileSaveSuccess();
}

function validateContact(contact) {
  return /^09\d{9}$/.test(contact);
}

function showFieldError(input, errorElement, message) {
  if (input) {
    input.classList.add("field-invalid");
    input.setAttribute("aria-invalid", "true");
  }

  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add("show");
  }
}

function clearFieldError(input, errorElement) {
  if (input) {
    input.classList.remove("field-invalid");
    input.removeAttribute("aria-invalid");
  }

  if (errorElement) {
    errorElement.textContent = "";
    errorElement.classList.remove("show");
  }
}

function clearProfileValidation() {
  const contactInput = document.getElementById("profileModalContactInput");
  const contactError = document.getElementById("profileModalContactError");

  clearFieldError(contactInput, contactError);
}

function validateProfileFields() {
  const contactInput = document.getElementById("profileModalContactInput");
  const contactError = document.getElementById("profileModalContactError");

  if (!contactInput) {
    return false;
  }

  clearProfileValidation();

  const contact = contactInput.value.trim();

  if (!contact) {
    showFieldError(contactInput, contactError, "Contact number is required.");
    contactInput.focus();
    return false;
  }

  if (!validateContact(contact)) {
    showFieldError(
      contactInput,
      contactError,
      "Use a valid 11-digit number starting with 09.",
    );
    contactInput.focus();
    return false;
  }

  return true;
}

async function saveProfileChanges() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    return;
  }

  const card = backdrop.querySelector(".profile-modal-card");
  const contactInput = document.getElementById("profileModalContactInput");
  const saveBtn = document.getElementById("profileSaveBtn");

  if (!card || !contactInput) {
    return;
  }

  if (!validateProfileFields()) {
    return;
  }

  const contact = contactInput.value.trim();
  const staff = getStaffData();

  const updatedStaff = {
    ...staff,
    contact,
  };

  if (!(await saveStaffData(updatedStaff))) {
    return;
  }

  const refreshedStaff = getStaffData();
  populateProfileModal(refreshedStaff);
  updateSidebarProfile(refreshedStaff);

  card.classList.remove("editing");

  if (saveBtn) {
    saveBtn.disabled = true;

    setTimeout(() => {
      saveBtn.disabled = false;
    }, 300);
  }

  showProfileSaveSuccess();
}

function showProfileSaveSuccess() {
  const successEl = document.getElementById("profileSaveSuccess");

  if (!successEl) {
    return;
  }

  if (profileSuccessTimeout) {
    clearTimeout(profileSuccessTimeout);
  }

  successEl.classList.add("show");

  profileSuccessTimeout = setTimeout(() => {
    successEl.classList.remove("show");
    profileSuccessTimeout = null;
  }, 2500);
}

function hideProfileSaveSuccess() {
  const successEl = document.getElementById("profileSaveSuccess");

  if (profileSuccessTimeout) {
    clearTimeout(profileSuccessTimeout);
    profileSuccessTimeout = null;
  }

  if (successEl) {
    successEl.classList.remove("show");
  }
}

function initProfileLogic() {
  const backdrop = document.getElementById("profileModalBackdrop");

  if (!backdrop) {
    return;
  }

  if (backdrop.dataset.initialized === "true") {
    return;
  }

  backdrop.dataset.initialized = "true";

  const closeBtn = document.getElementById("profileModalClose");
  const editBtn = document.getElementById("profileEditBtn");
  const cancelBtn = document.getElementById("profileCancelBtn");
  const saveBtn = document.getElementById("profileSaveBtn");
  const contactInput = document.getElementById("profileModalContactInput");

  const staff = getStaffData();

  populateProfileModal(staff);
  updateSidebarProfile(staff);

  closeBtn?.addEventListener("click", closeProfileModal);
  editBtn?.addEventListener("click", startProfileEditing);
  cancelBtn?.addEventListener("click", cancelProfileEditing);
  saveBtn?.addEventListener("click", saveProfileChanges);

  contactInput?.addEventListener("input", () => {
    contactInput.value = contactInput.value.replace(/\D/g, "").slice(0, 11);

    const contactError = document.getElementById("profileModalContactError");

    if (validateContact(contactInput.value.trim())) {
      clearFieldError(contactInput, contactError);
    }
  });

  contactInput?.addEventListener("blur", () => {
    const contact = contactInput.value.trim();
    const contactError = document.getElementById("profileModalContactError");

    if (!contact) {
      return;
    }

    if (!validateContact(contact)) {
      showFieldError(
        contactInput,
        contactError,
        "Use a valid 11-digit number starting with 09.",
      );
    }
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeProfileModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && backdrop.classList.contains("active")) {
      closeProfileModal();
    }
  });

  const imageEl = document.getElementById("profileModalImage");

  imageEl?.addEventListener("error", () => {
    const initialsEl = document.getElementById("profileModalInitials");

    imageEl.removeAttribute("src");
    imageEl.style.display = "none";

    if (initialsEl) {
      initialsEl.textContent = getInitials(getStaffData().name);
      initialsEl.style.display = "flex";
    }
  });
}

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
