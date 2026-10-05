(function () {
  "use strict";
  const FORECAST_API = "../../api/inventory/forecast.php";
  const INVENTORY_API = "../../api/inventory.php?action=list";
  const MAX_DROPDOWN_ITEMS = 10;
  const VIEW_MORE_VALUE = "__view_more__";
  const INVENTORY_PAGE_URL = "../inventory/inventory.html";
  const COLORS = {
    actual: "#19793f",
    actualFill: "rgba(25,121,63,0.10)",
    forecast: "#d98e04",
    sma: "#2064c9",
    rf: "#7440c9",
    grid: "#e7ece9",
    text: "#6b7970",
  };
  const state = {
    forecasts: [],
    historyByItem: {},
    inventory: [],
    selected: "",
    selectedByUser: false,
    chart: null,
  };
  const $ = (id) => document.getElementById(id);
  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const num = (v) => {
    if (v === null || v === undefined || v === "") {
      return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (n) =>
    Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  function shortDate(value) {
    if (!value) return "";
    const text = String(value);
    const d = new Date(
      text.length === 7
        ? `${text}-01T00:00:00`
        : `${text.slice(0, 10)}T00:00:00`,
    );
    if (Number.isNaN(d.getTime())) {
      return text;
    }
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  async function loadData() {
    const [fr, ir] = await Promise.all([
      fetch(FORECAST_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(INVENTORY_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);
    if (!fr.ok) {
      throw new Error("Forecast request failed.");
    }
    const fj = await fr.json();
    if (!fj.success) {
      throw new Error(fj.message || "Forecast unavailable.");
    }
    state.forecasts = Array.isArray(fj.forecasts) ? fj.forecasts : [];
    let byItem =
      fj.history_by_item && typeof fj.history_by_item === "object"
        ? fj.history_by_item
        : {};
    if (!Object.keys(byItem).length && Array.isArray(fj.history)) {
      byItem = {};
      fj.history.forEach((r) => {
        const k = r.item_name;
        if (!k) return;
        (byItem[k] = byItem[k] || []).push(r);
      });
    }
    state.historyByItem = byItem;
    try {
      if (ir.ok) {
        const ij = await ir.json();
        state.inventory = Array.isArray(ij?.data?.items) ? ij.data.items : [];
      }
    } catch (e) {
      state.inventory = [];
    }
  }
  function getItemNames() {
    const map = new Map();
    state.forecasts.forEach((f) => {
      if (f.item_name) {
        map.set(norm(f.item_name), f.item_name);
      }
    });
    Object.keys(state.historyByItem).forEach((n) => {
      map.set(norm(n), map.get(norm(n)) || n);
    });
    state.inventory.forEach((i) => {
      const n = i.name || i.item_name;
      if (n) {
        map.set(norm(n), map.get(norm(n)) || n);
      }
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }
  function getHistory(name) {
    const key = Object.keys(state.historyByItem).find(
      (k) => norm(k) === norm(name),
    );
    const rows = key ? state.historyByItem[key] : [];
    return [...(rows || [])].sort((a, b) =>
      String(a.demand_date).localeCompare(String(b.demand_date)),
    );
  }
  const getForecast = (name) =>
    state.forecasts.find((f) => norm(f.item_name) === norm(name));
  const getInventoryItem = (name) =>
    state.inventory.find((i) => norm(i.name || i.item_name) === norm(name));
  function getDropdownItems(names) {
    if (names.length <= MAX_DROPDOWN_ITEMS) {
      return names;
    }
    return [...names.slice(0, MAX_DROPDOWN_ITEMS), VIEW_MORE_VALUE];
  }
  function buildSelect() {
    const container = $("fcItemSelect");
    const button = $("fcItemSelectButton");
    const selectedText = $("fcSelectedItem");
    const menu = $("fcItemSelectMenu");
    if (!container || !button || !selectedText || !menu) return;
    const names = getItemNames();
    if (!names.length) {
      selectedText.textContent = "Select item";
      menu.innerHTML = "";
      state.selected = "";
      state.selectedByUser = false;
      return;
    }
    if (
      !state.selected ||
      !names.some((n) => norm(n) === norm(state.selected))
    ) {
      const withData = names
        .map((n) => ({
          n,
          f: getForecast(n),
          h: getHistory(n),
        }))
        .filter((x) => x.h.length > 0);
      withData.sort(
        (a, b) =>
          (num(b.f?.selected_forecast) ?? -1) -
          (num(a.f?.selected_forecast) ?? -1),
      );
      state.selected = (withData[0] || { n: names[0] }).n;
      state.selectedByUser = false;
    }
    selectedText.textContent = state.selectedByUser
      ? state.selected
      : "Select item";
    const dropdownItems = getDropdownItems(names);
    menu.innerHTML = dropdownItems
      .map((item) => {
        if (item === VIEW_MORE_VALUE) {
          return `
          <button type="button" class="fc-select-more" data-value="${VIEW_MORE_VALUE}">
            View more...
          </button>
        `;
        }
        const selected = norm(item) === norm(state.selected);
        return `
        <button type="button" class="fc-select-option${selected ? " selected" : ""}" data-value="${esc(item)}" role="option" aria-selected="${selected}">
          <span>${esc(item)}</span>
          ${selected ? '<i class="fa-solid fa-check"></i>' : ""}
        </button>
      `;
      })
      .join("");
  }
  function goToInventoryPage2() {
    window.location.assign(`${INVENTORY_PAGE_URL}?page=2`);
  }
  function setText(id, value) {
    const el = $(id);
    if (el) {
      el.textContent = value;
    }
  }
  function setInsight(tone, icon, text) {
    const box = $("fcInsight");
    if (!box) return;
    box.dataset.tone = tone;
    const iconEl = box.querySelector("i");
    if (iconEl) {
      iconEl.className = `fa-solid ${icon}`;
    }
    setText("fcInsightText", text);
  }
  function modelLabel(f) {
    const m = norm(f?.model_name);
    if (m === "randomforestregressor" || m === "random forest") {
      return "Random Forest";
    }
    if (m === "sma") {
      return "SMA";
    }
    return "";
  }
  function showEmpty(message) {
    const empty = $("fcEmpty");
    if (empty) {
      empty.hidden = false;
      setText("fcEmptyText", message);
    }
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
  }
  function resetStats() {
    setText("fcPredicted", "—");
    setText("fcPredictedSub", "Next period");
    setText("fcModel", "—");
    setText("fcModelSub", "Best model picked");
    setText("fcAccuracy", "—");
    setText("fcAccuracySub", "Model reliability");
  }
  function render() {
    const name = state.selected;
    if (!name) {
      resetStats();
      setInsight(
        "info",
        "fa-circle-info",
        "Select an item to see its forecast.",
      );
      showEmpty("No inventory items available yet.");
      return;
    }
    const history = getHistory(name);
    const f = getForecast(name);
    const invItem = getInventoryItem(name);
    const unit = invItem?.unit ? String(invItem.unit) : "units";
    if (!history.length) {
      resetStats();
      setInsight(
        "info",
        "fa-circle-info",
        `No usage recorded for ${name} yet. Record stock-outs so the AI can learn its demand.`,
      );
      showEmpty("No historical usage data for this item yet.");
      return;
    }
    const sma = num(f?.sma_forecast);
    const rf = num(f?.random_forest_forecast);
    const selected = num(f?.selected_forecast) ?? rf ?? sma;
    const forecastDate = f?.forecast_date || null;
    const hasForecast = selected !== null && !!forecastDate;
    const evaluated = !!f?.evaluation_available;
    const accuracy = num(f?.accuracy);
    setText("fcPredicted", hasForecast ? `${fmt(selected)} ${unit}` : "—");
    setText(
      "fcPredictedSub",
      hasForecast
        ? `Expected by ${shortDate(forecastDate)}`
        : "Not enough data yet",
    );
    const label = modelLabel(f);
    setText("fcModel", hasForecast && label ? label : "—");
    setText(
      "fcModelSub",
      label === "Random Forest"
        ? "Machine learning model"
        : label === "SMA"
          ? "Simple moving average"
          : "Best model picked",
    );
    setText(
      "fcAccuracy",
      evaluated && accuracy !== null ? `${fmt(accuracy)}%` : "—",
    );
    setText(
      "fcAccuracySub",
      evaluated && accuracy !== null
        ? accuracy >= 80
          ? "High reliability"
          : accuracy >= 60
            ? "Moderate reliability"
            : "Low reliability"
        : "Needs more history",
    );
    if (!hasForecast) {
      setInsight(
        "info",
        "fa-hourglass-half",
        `Not enough history yet to forecast ${name}. Keep recording usage and the AI will start predicting.`,
      );
    } else if (invItem) {
      const stock =
        num(invItem.stock ?? invItem.quantity ?? invItem.current_stock) ?? 0;
      if (stock <= 0) {
        setInsight(
          "danger",
          "fa-triangle-exclamation",
          `${name} is out of stock, but about ${fmt(selected)} ${unit} are expected to be used. Restock as soon as possible.`,
        );
      } else if (stock < selected) {
        setInsight(
          "warn",
          "fa-triangle-exclamation",
          `Expected demand is ${fmt(selected)} ${unit} but only ${fmt(stock)} ${unit} are in stock. Consider restocking soon.`,
        );
      } else {
        setInsight(
          "ok",
          "fa-circle-check",
          `Stock is enough: ${fmt(stock)} ${unit} on hand vs. ${fmt(selected)} ${unit} expected demand.`,
        );
      }
    } else {
      setInsight(
        "info",
        "fa-wand-magic-sparkles",
        `The AI expects about ${fmt(selected)} ${unit} of ${name} to be used by ${shortDate(forecastDate)}.`,
      );
    }
    drawChart(history, {
      hasForecast,
      forecastDate,
      selected,
      sma,
      rf,
      unit,
    });
  }
  function drawChart(history, fc) {
    const canvas = $("fcChart");
    const empty = $("fcEmpty");
    if (!canvas) return;
    if (typeof Chart === "undefined") {
      showEmpty(
        "Chart library could not be loaded. Check your internet connection.",
      );
      return;
    }
    if (empty) {
      empty.hidden = true;
    }
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const labels = history.map((r) => shortDate(r.demand_date));
    const actual = history.map((r) => Number(r.total_used || 0));
    const n = actual.length;
    const actualData = [...actual];
    const forecastLine = Array(n).fill(null);
    const smaPoint = Array(n).fill(null);
    const rfPoint = Array(n).fill(null);
    if (fc.hasForecast) {
      labels.push(`${shortDate(fc.forecastDate)} (forecast)`);
      actualData.push(null);
      forecastLine[n - 1] = actual[n - 1];
      forecastLine.push(fc.selected);
      smaPoint.push(fc.sma);
      rfPoint.push(fc.rf);
    }
    const datasets = [
      {
        label: "Actual usage",
        data: actualData,
        borderColor: COLORS.actual,
        backgroundColor: COLORS.actualFill,
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: COLORS.actual,
      },
    ];
    if (fc.hasForecast) {
      datasets.push(
        {
          label: "AI forecast",
          data: forecastLine,
          borderColor: COLORS.forecast,
          borderDash: [6, 5],
          borderWidth: 2.5,
          pointRadius: forecastLine.map((v, i) =>
            i === labels.length - 1 ? 7 : 0,
          ),
          pointBackgroundColor: COLORS.forecast,
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          spanGaps: true,
          tension: 0,
        },
        {
          label: "SMA",
          data: smaPoint,
          showLine: false,
          pointStyle: "rectRot",
          pointRadius: 5,
          pointBackgroundColor: COLORS.sma,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
        },
        {
          label: "Random Forest",
          data: rfPoint,
          showLine: false,
          pointStyle: "triangle",
          pointRadius: 6,
          pointBackgroundColor: COLORS.rf,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
        },
      );
    }
    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 7,
              boxHeight: 7,
              padding: 14,
              color: COLORS.text,
              font: {
                size: 10,
                family: "Inter,sans-serif",
              },
            },
          },
          tooltip: {
            backgroundColor: "#14201a",
            padding: 10,
            titleFont: {
              size: 11,
            },
            bodyFont: {
              size: 11,
            },
            filter: (ctx) => ctx.parsed.y !== null,
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)} ${fc.unit}`,
            },
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: COLORS.text,
              font: {
                size: 9,
              },
              maxRotation: 0,
              autoSkipPadding: 12,
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: COLORS.grid,
            },
            ticks: {
              color: COLORS.text,
              font: {
                size: 9,
              },
              precision: 0,
            },
            title: {
              display: true,
              text: `Quantity used (${fc.unit})`,
              color: COLORS.text,
              font: {
                size: 9,
              },
            },
          },
        },
      },
    });
  }
  async function refresh() {
    try {
      await loadData();
      buildSelect();
      render();
    } catch (error) {
      console.error("Forecast widget error:", error);
      resetStats();
      setInsight(
        "danger",
        "fa-circle-exclamation",
        "Unable to load the AI forecast right now.",
      );
      showEmpty("Forecast data could not be loaded.");
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const container = $("fcItemSelect");
    const button = $("fcItemSelectButton");
    const menu = $("fcItemSelectMenu");
    if (!container || !button || !menu) return;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = container.classList.contains("open");
      document.querySelectorAll(".custom-select.open").forEach((dropdown) => {
        dropdown.classList.remove("open");
        const dropdownButton = dropdown.querySelector(".fc-select-button");
        if (dropdownButton) {
          dropdownButton.setAttribute("aria-expanded", "false");
        }
        const dropdownMenu = dropdown.querySelector(".fc-select-menu");
        if (dropdownMenu) {
          dropdownMenu.hidden = true;
        }
      });
      if (!isOpen) {
        container.classList.add("open");
        button.setAttribute("aria-expanded", "true");
        menu.hidden = false;
      }
    });
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-value]");
      if (!option) return;
      const value = option.dataset.value;
      if (value === VIEW_MORE_VALUE) {
        goToInventoryPage2();
        return;
      }
      state.selected = value;
      state.selectedByUser = true;
      const selectedText = $("fcSelectedItem");
      if (selectedText) {
        selectedText.textContent = value;
      }
      container.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      buildSelect();
      render();
    });
    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) {
        container.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
        menu.hidden = true;
      }
    });
    const viewFullForecast = $("fcViewFullForecast");
    if (viewFullForecast) {
      viewFullForecast.addEventListener("click", (event) => {
        event.preventDefault();
        goToInventoryPage2();
      });
    }
    void refresh();
    window.addEventListener("focus", () => void refresh());
    window.addEventListener("inventory:data-changed", () => void refresh());
  });
  window.DashboardForecast = {
    refresh,
  };
})();
