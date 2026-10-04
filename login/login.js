document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.querySelector(".auth-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberMe = document.querySelector('input[name="remember"]');
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const eyeIcon = document.getElementById("eyeIcon");
  const errorBox = document.getElementById("loginErrorMsg");
  const errorText = document.getElementById("errorText");
  const REMEMBERED_EMAIL_KEY = "rememberedEmail";
  function showError(message) {
    if (!errorBox || !errorText) {
      return;
    }
    errorText.textContent = message;
    errorBox.style.display = "flex";
  }
  function hideError() {
    if (errorBox) {
      errorBox.style.display = "none";
    }
  }
  function getRedirectPage(role) {
    const normalizedRole = String(role || "")
      .trim()
      .toLowerCase();
    if (normalizedRole === "user") {
      return "../patients/dashboard/dashboard.html";
    }
    if (normalizedRole === "staff") {
      return "../staff/dashboard/dashboard.html";
    }
    if (normalizedRole === "doctor") {
      return "../doctor/dashboard/dashboard.html";
    }
    return null;
  }
  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener("click", function () {
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");
      eyeIcon.classList.toggle("fa-eye", !isPassword);
      eyeIcon.classList.toggle("fa-eye-slash", isPassword);
    });
  }
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if (rememberedEmail && emailInput) {
    emailInput.value = rememberedEmail;
    if (rememberMe) {
      rememberMe.checked = true;
    }
  }
  if (emailInput) {
    emailInput.addEventListener("input", hideError);
  }
  if (passwordInput) {
    passwordInput.addEventListener("input", hideError);
  }
  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      hideError();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const password = passwordInput ? passwordInput.value : "";
      if (!email || !password) {
        showError("Please enter your email and password.");
        return;
      }
      const formData = new FormData(loginForm);
      formData.set("email", email);
      formData.set("password", password);
      formData.set("remember", rememberMe && rememberMe.checked ? "1" : "0");
      const submitButton = loginForm.querySelector(".btn-submit");
      const originalButtonText = submitButton ? submitButton.textContent : "";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Logging In...";
      }
      try {
        const response = await fetch("login.php", {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json();
        if (!data.success) {
          showError(
            data.message || "Email or password is incorrect. Please try again.",
          );
          return;
        }
        const validUser = data.user || {};
        const userRole = String(validUser.role || "")
          .trim()
          .toLowerCase();
        const redirectPage = data.redirect || getRedirectPage(userRole);
        if (!redirectPage) {
          showError("Your account role is not recognized.");
          console.error("Unrecognized account role:", userRole);
          return;
        }
        if (rememberMe && rememberMe.checked) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        const targetUrl = new URL(redirectPage, window.location.href).href;
        const storedUser = {
          ...validUser,
          name:
            validUser.name ||
            `${validUser.firstname || ""} ${validUser.lastname || ""}`.trim(),
          role: userRole,
          profileImage: validUser.profile_image || "",
          staffId: validUser.staff_id || "",
          patientId: validUser.patient_id || "",
        };
        localStorage.setItem("currentUser", JSON.stringify(storedUser));
        sessionStorage.setItem("currentUser", JSON.stringify(storedUser));
        window.top.location.href = targetUrl;
      } catch (error) {
        console.error("Login request error:", error);
        showError("Unable to connect to the server. Please try again.");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalButtonText;
        }
      }
    });
  }
});
