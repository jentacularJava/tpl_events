(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  const TIME_SLOTS = generateTimeSlots("06:00", "23:30", 30);

  // ── State ──────────────────────────────────────────────────────
  let allEvents    = [];   // full dataset as loaded
  let filtered     = [];   // result of current filter pass
  let currentPage  = 1;
  let sortCol      = "date";
  let sortDir      = 1;    // 1 = asc, -1 = desc

  // ── DOM refs ───────────────────────────────────────────────────
  const metaBar      = document.getElementById("meta-bar");
  const statusMsg    = document.getElementById("status-msg");
  const table        = document.getElementById("events-table");
  const tbody        = document.getElementById("table-body");
  const pagination   = document.getElementById("pagination");
  const resultCount  = document.getElementById("result-count");
  const pageInfo     = document.getElementById("page-info");
  const prevBtn      = document.getElementById("prev-btn");
  const nextBtn      = document.getElementById("next-btn");
  const clearBtn     = document.getElementById("clear-btn");
  const dateFrom     = document.getElementById("date-from");
  const dateTo       = document.getElementById("date-to");
  const timeFrom     = document.getElementById("time-from");
  const timeTo       = document.getElementById("time-to");
  const audienceList  = document.getElementById("audience-list");

  // ── Time slot generator ────────────────────────────────────────
  function generateTimeSlots(start, end, stepMinutes) {
    const slots = [];
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    while (h < eh || (h === eh && m <= em)) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const val = `${hh}:${mm}`;
      const label = formatTime(val);
      slots.push({ val, label });
      m += stepMinutes;
      if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    }
    return slots;
  }

  function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h < 12 ? "am" : "pm";
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function formatDate(d) {
    if (!d) return "";
    const [y, mo, day] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[Number(mo) - 1]} ${Number(day)}, ${y}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Populate filter controls ───────────────────────────────────
  function populateTimeSelects() {
    TIME_SLOTS.forEach(({ val, label }) => {
      const o1 = new Option(label, val);
      const o2 = new Option(label, val);
      timeFrom.appendChild(o1);
      timeTo.appendChild(o2);
    });
  }

  function populateLibraries(events) {
  const libraryList = document.getElementById("library-list");
  const locations = [...new Set(events.map(e => e.location).filter(Boolean))].sort();
  populateCheckboxList(libraryList, locations, "library");
  }

  function populateCheckboxList(container, values, groupName) {
    container.innerHTML = "";
    values.sort().forEach(val => {
      const id  = `${groupName}-${val.replace(/\W+/g, "-")}`;
      const lbl = document.createElement("label");
      lbl.htmlFor = id;
      const cb  = document.createElement("input");
      cb.type   = "checkbox";
      cb.id     = id;
      cb.value  = val;
      cb.name   = groupName;
      cb.addEventListener("change", onFilterChange);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" " + val));
      container.appendChild(lbl);
    });
  }

  function populateFilters(events) {
    populateLibraries(events);
    const audiences  = [...new Set(events.flatMap(e => e.audiences))].filter(Boolean);
    populateCheckboxList(audienceList,  audiences,  "audience");
  }

  // ── Get current filter values ──────────────────────────────────
  function getFilters() {
    const checkedValues = (container) =>
      [...container.querySelectorAll("input[type=checkbox]:checked")].map(cb => cb.value);

    return {
      dateFrom:   dateFrom.value,
      dateTo:     dateTo.value,
      timeFrom:   timeFrom.value,
      timeTo:     timeTo.value,
      locations:  checkedValues(document.getElementById("library-list")),
      audiences:  checkedValues(audienceList),
    };
  }

  // ── Filter logic ───────────────────────────────────────────────
  function applyFilters() {
    const f = getFilters();

    filtered = allEvents.filter(e => {
      if (f.dateFrom && e.date < f.dateFrom) return false;
      if (f.dateTo   && e.date > f.dateTo)   return false;
      if (f.timeFrom && e.startTime < f.timeFrom) return false;
      if (f.timeTo   && e.startTime > f.timeTo)   return false;
      if (f.locations.length && !f.locations.includes(e.location)) return false;
      if (f.audiences.length  && !f.audiences.some(a => e.audiences.includes(a)))   return false;
      return true;
    });

    sortFiltered();
    currentPage = 1;
    render();
  }

  // ── Sort ───────────────────────────────────────────────────────
  function sortFiltered() {
    filtered.sort((a, b) => {
      let av = a[sortCol] || "";
      let bv = b[sortCol] || "";
      if (av === bv) {
        av = (a.date || "") + (a.startTime || "");
        bv = (b.date || "") + (b.startTime || "");
      }
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
  }

  function updateSortHeaders() {
    document.querySelectorAll("thead th[data-col]").forEach(th => {
      const col = th.dataset.col;
      const arrow = th.querySelector(".sort-arrow");
      th.classList.remove("sorted");
      if (col === sortCol) {
        th.classList.add("sorted");
        arrow.innerHTML = sortDir === 1 ? "&#x25B2;" : "&#x25BC;";
      } else {
        arrow.innerHTML = "&#x25B4;&#x25BE;";
      }
    });
  }

  // ── Render table ───────────────────────────────────────────────
  function render() {
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const end   = Math.min(start + PAGE_SIZE, total);
    const slice = filtered.slice(start, end);

    resultCount.textContent = `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`;

    if (total === 0) {
      statusMsg.textContent = "No events match your filters.";
      statusMsg.style.display = "block";
      table.style.display = "none";
      pagination.style.display = "none";
      return;
    }

    statusMsg.style.display = "none";
    table.style.display = "table";

    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    slice.forEach(e => {
      const tr = document.createElement("tr");
      const tagHTML = (arr, cls) =>
        arr.map(v => `<span class="tag ${cls}">${escHTML(v)}</span>`).join("");

      tr.innerHTML = `
        <td>${escHTML(e.title)}</td>
        <td style="white-space:nowrap">${escHTML(formatDate(e.date))}</td>
        <td style="white-space:nowrap">${escHTML(formatTime(e.startTime))}</td>
        <td style="white-space:nowrap">${escHTML(formatTime(e.endTime))}</td>
        <td>${escHTML(e.location)}</td>
        <td>${tagHTML(e.audiences, "audience")}</td>
        <td>${tagHTML(e.eventTypes, "")}</td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    if (totalPages <= 1) {
      pagination.style.display = "none";
    } else {
      pagination.style.display = "flex";
      pageInfo.textContent = `Page ${currentPage} of ${totalPages} (showing ${start + 1}–${end} of ${total.toLocaleString()})`;
      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage === totalPages;
    }

    updateSortHeaders();
  }

  function escHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Event listeners ────────────────────────────────────────────
  function onFilterChange() {
    applyFilters();
  }

  dateFrom.addEventListener("change", onFilterChange);
  dateTo.addEventListener("change",   onFilterChange);
  timeFrom.addEventListener("change", onFilterChange);
  timeTo.addEventListener("change",   onFilterChange);

  clearBtn.addEventListener("click", () => {
    dateFrom.value = todayISO();
    dateTo.value   = "";
    timeFrom.value = "";
    timeTo.value   = "";
    document.querySelectorAll("#audience-list input, #library-list input").forEach(cb => {
      cb.checked = false;
    });
    sortCol = "date";
    sortDir = 1;
    applyFilters();
  });

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; render(); scrollToTable(); }
  });

  nextBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage < totalPages) { currentPage++; render(); scrollToTable(); }
  });

  document.querySelectorAll("thead th[data-col]").forEach(th => {
    const handleSort = () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = -sortDir;
      } else {
        sortCol = col;
        sortDir = 1;
      }
      sortFiltered();
      render();
    };
    th.addEventListener("click", handleSort);
    th.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") handleSort(); });
  });

  function scrollToTable() {
    document.getElementById("table-wrapper").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Easter egg: Konami code ────────────────────────────────────
  // Sequence: up up down down left right left right b a
  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown",
                  "ArrowLeft","ArrowRight","ArrowLeft","ArrowRight",
                  "b","a"];
  let konamiProgress = 0;

  const overlay   = document.getElementById("easter-egg-overlay");
  const closeBtn  = document.getElementById("easter-egg-close");

  document.addEventListener("keydown", (e) => {
    if (e.key === KONAMI[konamiProgress]) {
      konamiProgress++;
      if (konamiProgress === KONAMI.length) {
        konamiProgress = 0;
        overlay.classList.add("active");
        closeBtn.focus();
      }
    } else {
      konamiProgress = e.key === KONAMI[0] ? 1 : 0;
    }
  });

  closeBtn.addEventListener("click", () => {
    overlay.classList.remove("active");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      overlay.classList.remove("active");
    }
  });

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    try {
      const [eventsRes, metaRes] = await Promise.all([
        fetch("data/events.json"),
        fetch("data/meta.json"),
      ]);

      if (!eventsRes.ok) throw new Error(`events.json: HTTP ${eventsRes.status}`);
      allEvents = await eventsRes.json();

      if (metaRes.ok) {
        const meta = await metaRes.json();
        const updated = meta.lastUpdatedOn
          ? new Date(meta.lastUpdatedOn).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
          : "unknown";
        metaBar.textContent = `${meta.recordCount?.toLocaleString() ?? allEvents.length} events | data last updated: ${updated}`;
      } else {
        metaBar.textContent = `${allEvents.length.toLocaleString()} events loaded`;
      }

      populateTimeSelects();
      populateFilters(allEvents);
      dateFrom.value = todayISO();
      applyFilters();

    } catch (err) {
      statusMsg.textContent = "Unable to load events. Please try refreshing.";
      metaBar.textContent   = "Failed to load data.";
      console.error(err);
    }
  }

  init();

})();