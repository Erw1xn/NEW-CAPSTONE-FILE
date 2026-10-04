document.addEventListener("DOMContentLoaded", () => {
  loadSidebar();
});
async function loadSidebar(activePageKey) {
  const container = document.getElementById("sidebar-container");
  if (!container) {
    return;
  }
  try {
    const response = await fetch("../../navigation_bar/sidebar.html");
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const html = await response.text();
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const logoutModal = tempDiv.querySelector("#logoutModalBackdrop");
    if (logoutModal) {
      logoutModal.remove();
    }
    container.innerHTML = tempDiv.innerHTML;
    if (!document.getElementById("logoutModalBackdrop") && logoutModal) {
      document.body.appendChild(logoutModal);
    }
    setSidebarLinks();
    await loadActiveStaffProfile();
    let pageKey = activePageKey;
    if (!pageKey) {
      const currentPath = window.location.pathname;
      if (currentPath.includes("dashboard")) {
        pageKey = "dashboard";
      } else if (currentPath.includes("appointment")) {
        pageKey = "appointment";
      } else if (currentPath.includes("patient")) {
        pageKey = "patients";
      } else if (currentPath.includes("inventory")) {
        pageKey = "inventory";
      } else if (currentPath.includes("sms")) {
        pageKey = "sms";
      } else if (currentPath.includes("finance")) {
        pageKey = "finance";
      }
    }
    if (pageKey) {
      const activeLink = container.querySelector(`[data-page="${pageKey}"]`);
      if (activeLink) {
        activeLink.classList.add("active");
      }
    }
    applySavedSidebarState();
    initSidebarLogic();
  } catch (error) {
    console.error("Failed to load sidebar navigation:", error);
  }
}
function getAppBase() {
  const pathname = window.location.pathname;
  const staffIndex = pathname.indexOf("/staff/");
  if (staffIndex >= 0) {
    return pathname.substring(0, staffIndex + 1);
  }
  const pathParts = pathname.split("/").filter(Boolean);
  return pathParts.length ? `/${pathParts[0]}/` : "/";
}
function setSidebarLinks() {
  const appBase = getAppBase();
  document
    .querySelectorAll("#sidebar-container [data-path]")
    .forEach((link) => {
      link.href = `${appBase}${link.dataset.path}`;
    });
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
async function loadActiveStaffProfile() {
  const nameEl = document.getElementById("activeStaffName");
  const imageEl = document.getElementById("activeStaffImage");
  const initialsEl = document.getElementById("activeStaffInitials");
  if (!nameEl) {
    return;
  }
  try {
    const response = await fetch(
      `${getAppBase()}navigation_bar/sidebar.php?role=staff`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    if (response.status === 401 || response.status === 403) {
      window.location.href = `${getAppBase()}login/login.html`;
      return;
    }
    if (!response.ok) {
      throw new Error("Unable to load staff account.");
    }
    const data = await response.json();
    if (!data.success || !data.user) {
      window.location.href = `${getAppBase()}login/login.html`;
      return;
    }
    const currentUser = data.user;
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    const firstname = currentUser.firstname || "";
    const lastname = currentUser.lastname || "";
    const fullName =
      currentUser.name || `${firstname} ${lastname}`.trim() || "Staff";
    const initials = getInitials(fullName);
    nameEl.textContent = fullName;
    if (currentUser.profile_image && imageEl) {
      imageEl.src = currentUser.profile_image;
      imageEl.style.display = "block";
      if (initialsEl) initialsEl.style.display = "none";
    } else {
      if (imageEl) {
        imageEl.removeAttribute("src");
        imageEl.style.display = "none";
      }
      if (initialsEl) {
        initialsEl.textContent = initials;
        initialsEl.style.display = "flex";
      }
    }
  } catch (error) {
    console.error("Failed to load staff account:", error);
  }
}
function applySavedSidebarState() {
  const sidebar = document.getElementById("sidebar");
  const toggleIcon = document.getElementById("toggleIcon");
  if (!sidebar) {
    return;
  }
  const savedState = localStorage.getItem("sidebarState");
  if (window.innerWidth > 768) {
    if (savedState === "collapsed") {
      sidebar.classList.add("collapsed");
      if (toggleIcon) {
        toggleIcon.className = "fa-solid fa-chevron-right";
      }
    } else {
      sidebar.classList.remove("collapsed");
      if (toggleIcon) {
        toggleIcon.className = "fa-solid fa-chevron-left";
      }
    }
  }
}
function initSidebarLogic() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const toggleIcon = document.getElementById("toggleIcon");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      if (sidebar.classList.contains("collapsed")) {
        localStorage.setItem("sidebarState", "collapsed");
        if (toggleIcon) {
          toggleIcon.className = "fa-solid fa-chevron-right";
        }
      } else {
        localStorage.setItem("sidebarState", "expanded");
        if (toggleIcon) {
          toggleIcon.className = "fa-solid fa-chevron-left";
        }
      }
    });
  }
  if (mobileMenuToggle && sidebar) {
    mobileMenuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle("active");
      }
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      sidebarOverlay.classList.remove("active");
    });
  }
  const profileTrigger = document.getElementById("activeStaffProfileTrigger");
  if (profileTrigger) {
    profileTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof window.openProfileModal === "function") {
        window.openProfileModal();
      } else {
        console.warn("openProfileModal() is not available yet.");
      }
    });
  }
}
document.addEventListener("click", async (e) => {
  const logoutBtn = e.target.closest(".btn-logout");
  const cancelBtn = e.target.closest("#logoutCancelBtn");
  const confirmBtn = e.target.closest("#logoutConfirmBtn");
  const backdrop = document.getElementById("logoutModalBackdrop");
  if (logoutBtn) {
    e.preventDefault();
    if (backdrop) {
      backdrop.classList.add("active");
      document.body.classList.add("logout-modal-open");
    }
  }
  if (cancelBtn) {
    e.preventDefault();
    if (backdrop) {
      backdrop.classList.remove("active");
      document.body.classList.remove("logout-modal-open");
    }
  }
  if (backdrop && e.target === backdrop) {
    backdrop.classList.remove("active");
    document.body.classList.remove("logout-modal-open");
  }
  if (confirmBtn) {
    e.preventDefault();
    try {
      await fetch(`${getAppBase()}navigation_bar/sidebar.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "action=logout",
        credentials: "same-origin",
      });
    } finally {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("currentUser");
      sessionStorage.removeItem("currentUser");
      window.location.href = `${getAppBase()}homepage/homepage.html`;
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const backdrop = document.getElementById("logoutModalBackdrop");
  if (backdrop?.classList.contains("active")) {
    backdrop.classList.remove("active");
    document.body.classList.remove("logout-modal-open");
  }
});
