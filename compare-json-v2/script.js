(() => {
  "use strict";

  const BASE_TITLE = "ETL vs MuleSoft Comparison";
  const APP_VERSION = "v2024-05-09 16:50 EST"; // Update timestamp whenever code changes.

  const DiffEngine = window.JSONDiffEngine;

  const state = {
    results: [],
    selectedId: null
  };

  updatePageVersion();

  // Core DOM references.
  const etlInput = document.getElementById("etl-input");
  const muleInput = document.getElementById("mule-input");
  const compareBtn = document.getElementById("compare-btn");
  const messageBox = document.getElementById("message-box");
  const resultsBody = document.querySelector(".results-body");
  const detailView = document.getElementById("detail-view");
  const detailTitle = document.getElementById("detail-title");
  const detailStatus = document.getElementById("detail-status");
  const resultsSection = document.querySelector(".results");
  const resultsTable = document.getElementById("results-table");
  const etlPanel = document.getElementById("etl-panel");
  const mulePanel = document.getElementById("mule-panel");
  const etlBadge = document.getElementById("etl-badge");
  const muleBadge = document.getElementById("mule-badge");
  const etlJsonView = document.getElementById("etl-json");
  const muleJsonView = document.getElementById("mule-json");
  const diffSummary = document.getElementById("diff-summary");

  // Prepare drag-and-drop interactions for both textareas.
  setupDropZone(etlInput);
  setupDropZone(muleInput);

  compareBtn.addEventListener("click", compareDatasets);
  resultsBody.addEventListener("click", onRowClick);

  /**
   * Handle comparison flow: parse datasets, compute diff, and render results.
   */
  function compareDatasets() {
    const etlData = parseDataset(etlInput.value, "ETL");
    const muleData = parseDataset(muleInput.value, "MuleSoft");

    const messages = [...etlData.errors, ...muleData.errors];
    showMessages(messages);

    const combinedOrder = mergeOrders(etlData.order, muleData.order);
    const results = [];

    combinedOrder.forEach((id) => {
      const etlRecord = etlData.map[id];
      const muleRecord = muleData.map[id];

      if (!etlRecord && !muleRecord) {
        return;
      }

      let status = "MATCH";
      let diff = null;

      if (!etlRecord || !muleRecord) {
        status = "MISSING";
      } else if (etlRecord.parseError || muleRecord.parseError) {
        status = "INVALID";
      } else if (DiffEngine) {
        diff = DiffEngine.analyze(etlRecord.parsed, muleRecord.parsed);
        status = diff.isMatch ? "MATCH" : "DIFF";
      } else {
        status = deepEqual(etlRecord.parsed, muleRecord.parsed) ? "MATCH" : "DIFF";
      }

      results.push({
        index: results.length + 1,
        id,
        entityType: etlRecord?.entity_type || muleRecord?.entity_type || "—",
        status,
        etl: etlRecord || null,
        mule: muleRecord || null,
        diff
      });
    });

    state.results = results;
    state.selectedId = null;

    renderTable();
    hideDetailPanel();
    scrollResultsIntoView();
  }

  /**
   * Update document title and page headline with the current version string.
   */
  function updatePageVersion() {
    const titleNode = document.getElementById("page-title");
    if (titleNode) {
      const label = document.createElement("span");
      label.className = "version-label";
      label.textContent = APP_VERSION;
      titleNode.textContent = BASE_TITLE;
      titleNode.appendChild(label);
    }
    document.title = `${BASE_TITLE} · ${APP_VERSION}`;
  }

  /**
   * Populate comparison table with the latest results.
   */
  function renderTable() {
    resultsBody.innerHTML = "";

    if (!state.results.length) {
      const row = document.createElement("tr");
      row.className = "placeholder-row";
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "No overlapping records found. Verify the input data and try again.";
      row.appendChild(cell);
      resultsBody.appendChild(row);
      return;
    }

    state.results.forEach((result) => {
      const row = document.createElement("tr");
      row.dataset.id = result.id;
      row.dataset.status = result.status;
      row.classList.add(`status-${statusClassName(result.status)}`);

      const idxCell = document.createElement("td");
      idxCell.textContent = result.index;

      const idCell = document.createElement("td");
      idCell.textContent = result.id;

      const typeCell = document.createElement("td");
      typeCell.textContent = result.entityType;

      const statusCell = document.createElement("td");
      statusCell.textContent = statusLabel(result.status);

      row.append(idxCell, idCell, typeCell, statusCell);
      resultsBody.appendChild(row);
    });
  }

  /**
   * Smoothly scroll the results table into view after comparisons run.
   */
  function scrollResultsIntoView() {
    const target = resultsSection || resultsTable;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * React when the user clicks a table row to inspect a record.
   */
  function onRowClick(event) {
    const targetRow = event.target.closest("tr[data-id]");
    if (!targetRow) {
      return;
    }

    const { id } = targetRow.dataset;
    if (!id || id === state.selectedId) {
      return;
    }

    state.selectedId = id;
    highlightSelectedRow(id);
    const result = state.results.find((item) => item.id === id);
    if (result) {
      renderDetail(result);
      detailView.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /**
   * Render the detail panel for the selected record.
   */
  function renderDetail(result) {
    detailTitle.textContent = `Entity Reference ID: ${result.id}`;
    updateStatusChip(result.status);

    renderPanel(etlPanel, etlBadge, etlJsonView, result.etl, result.diff, "etl");
    renderPanel(mulePanel, muleBadge, muleJsonView, result.mule, result.diff, "mule");

    renderSummary(result);
    detailView.classList.remove("hidden");
  }

  /**
   * Display a human-readable summary beneath the detail grid.
   */
  function renderSummary(result) {
    const lines = [];

    switch (result.status) {
      case "MATCH":
        lines.push("<strong>MATCH:</strong> ETL and MuleSoft JSON payloads are identical.");
        break;
      case "DIFF":
        lines.push("<strong>DIFF:</strong> The JSON payloads differ.");
        if (result.diff?.changes) {
          const { added, removed, changed } = summarizeDiff(result.diff);
          lines.push(`Highlights show ${changed} changed field${plural(changed)}, ${removed} removed, and ${added} added.`);
        }
        break;
      case "MISSING":
        lines.push("<strong>MISSING:</strong> Record is present on only one side.");
        break;
      case "INVALID":
        lines.push("<strong>INVALID JSON:</strong> At least one record could not be parsed as valid JSON.");
        break;
      default:
        lines.push("<strong>Status:</strong> Review the datasets for potential issues.");
    }

    if (result.etl?.parseError) {
      lines.push(`ETL parse error: ${escapeHtml(result.etl.parseError)}.`);
    }
    if (result.mule?.parseError) {
      lines.push(`MuleSoft parse error: ${escapeHtml(result.mule.parseError)}.`);
    }

    diffSummary.innerHTML = lines.join(" ");
  }

  /**
   * Populate an individual JSON panel with data or placeholder messaging.
   */
  function renderPanel(panel, badge, container, record, diff, side) {
    panel.classList.remove("invalid", "missing");
    badge.classList.remove("good", "warn", "alert");
    container.innerHTML = "";
    container.style.whiteSpace = "pre";

    if (!record) {
      badge.textContent = "Missing";
      badge.classList.add("warn");
      panel.classList.add("missing");
      container.innerHTML = `<div class="placeholder">No data available.</div>`;
      return;
    }

    if (record.parseError) {
      badge.textContent = "Invalid";
      badge.classList.add("alert");
      panel.classList.add("invalid");

      const errorMessage = document.createElement("div");
      errorMessage.className = "invalid-json";
      errorMessage.textContent = `Invalid JSON: ${record.parseError}`;
      container.appendChild(errorMessage);

      const rawPre = document.createElement("pre");
      rawPre.className = "json-raw";
      rawPre.textContent = record.entity_representation;
      container.appendChild(rawPre);
      return;
    }

    badge.textContent = "Valid";
    badge.classList.add("good");

    if (diff && record && record.parsed && DiffEngine) {
      container.style.whiteSpace = "pre";
      const perspective = side === "etl" ? "left" : "right";
      container.innerHTML = DiffEngine.render(record.parsed, diff, perspective);
    } else {
      const pre = document.createElement("pre");
      pre.className = "json-raw";
      pre.textContent = record.pretty;
      container.appendChild(pre);
    }
  }

  /**
   * Update the status chip styling and text.
   */
  function updateStatusChip(status) {
    detailStatus.textContent = `Status: ${statusLabel(status)}`;
    detailStatus.classList.remove("match", "diff", "missing", "invalid");

    switch (status) {
      case "MATCH":
        detailStatus.classList.add("match");
        break;
      case "DIFF":
        detailStatus.classList.add("diff");
        break;
      case "MISSING":
        detailStatus.classList.add("missing");
        break;
      case "INVALID":
        detailStatus.classList.add("invalid");
        break;
      default:
        break;
    }
  }

  /**
   * Hide the detail panel when no row is selected.
   */
  function hideDetailPanel() {
    detailView.classList.add("hidden");
    detailTitle.textContent = "Record Details";
    detailStatus.textContent = "Status: —";
    diffSummary.textContent = "";
    etlJsonView.innerHTML = "";
    muleJsonView.innerHTML = "";
  }

  /**
   * Highlight the selected row in the comparison table.
   */
  function highlightSelectedRow(id) {
    [...resultsBody.querySelectorAll("tr[data-id]")].forEach((row) => {
      row.classList.toggle("selected", row.dataset.id === id);
    });
  }

  /**
   * Display parsing or validation messages above the table.
   */
  function showMessages(messages) {
    if (!messages.length) {
      messageBox.textContent = "";
      messageBox.classList.remove("visible");
      return;
    }

    const listItems = messages.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("");
    messageBox.innerHTML = `<strong>Review the following issues:</strong><ul>${listItems}</ul>`;
    messageBox.classList.add("visible");
  }

  /**
   * Enable drag-and-drop import for a textarea element.
   */
  function setupDropZone(textarea) {
    textarea.addEventListener("dragover", (event) => {
      event.preventDefault();
      textarea.classList.add("drag-active");
    });

    textarea.addEventListener("dragleave", () => {
      textarea.classList.remove("drag-active");
    });

    textarea.addEventListener("drop", (event) => {
      event.preventDefault();
      textarea.classList.remove("drag-active");

      const { files } = event.dataTransfer;
      if (files && files.length) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          textarea.value = e.target.result;
        };
        reader.readAsText(file);
        return;
      }

      const text = event.dataTransfer.getData("text/plain");
      if (text) {
        textarea.value = text;
      }
    });
  }

  /**
   * Parse dataset text (CSV or TSV) into structured records keyed by entity_reference_id.
   */
  function parseDataset(rawText, label) {
    const map = {};
    const order = [];
    const errors = [];

    if (!rawText.trim()) {
      return { map, order, errors };
    }

    const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length);
    if (!lines.length) {
      return { map, order, errors };
    }

    const delimiter = detectDelimiter(lines);
    const headerInfo = readHeader(lines[0], delimiter);
    const hasHeader = headerInfo.isHeader;
    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const fields = splitLine(rawLine, delimiter);

      if (fields.length < 3) {
        errors.push(`${label}: Line ${i + 1} has fewer than 3 columns.`);
        continue;
      }

      const id = extractField(fields, headerInfo, "entity_reference_id", 0);
      if (!id) {
        errors.push(`${label}: Line ${i + 1} is missing an entity_reference_id.`);
        continue;
      }

      const entityType = extractField(fields, headerInfo, "entity_type", 1);
      const representationRaw = extractField(fields, headerInfo, "entity_representation", 2);

      const record = {
        entity_reference_id: id,
        entity_type: entityType || "—",
        entity_representation: representationRaw,
        parsed: null,
        parseError: null,
        pretty: representationRaw
      };

      if (representationRaw) {
        try {
          const parsedJson = JSON.parse(representationRaw);
          const sanitized = sanitizeData(parsedJson);
          record.parsed = sanitized === undefined ? null : sanitized;
          record.pretty = JSON.stringify(record.parsed, null, 2);
        } catch (error) {
          record.parseError = error instanceof Error ? error.message : "Unknown parse error";
        }
      }

      if (!map[id]) {
        order.push(id);
      } else {
        errors.push(`${label}: Duplicate entity_reference_id '${id}' detected; keeping the latest entry.`);
      }

      map[id] = record;
    }

    return { map, order, errors };
  }

  /**
   * Choose the most likely delimiter for the dataset (prefers tabs over commas when ties).
   */
  function detectDelimiter(lines) {
    const sample = lines.find((line) => line.trim().length) || "";
    const tabCount = (sample.match(/\t/g) || []).length;
    const commaCount = (sample.match(/,/g) || []).length;
    return tabCount >= commaCount ? "\t" : ",";
  }

  /**
   * Parse the header row and return column metadata.
   */
  function readHeader(line, delimiter) {
    const values = splitLine(line, delimiter).map((value) => normalize(value));
    const lower = values.map((value) => value.toLowerCase());

    return {
      isHeader: lower.includes("entity_reference_id"),
      columns: {
        entity_reference_id: lower.indexOf("entity_reference_id"),
        entity_type: lower.indexOf("entity_type"),
        entity_representation: lower.indexOf("entity_representation")
      }
    };
  }

  /**
   * Extract a field either by header column name or fallback index.
   */
  function extractField(fields, headerInfo, name, fallbackIndex) {
    const index = headerInfo.isHeader && headerInfo.columns[name] >= 0
      ? headerInfo.columns[name]
      : fallbackIndex;

    const value = fields[index] ?? "";
    return normalize(value);
  }

  /**
   * Merge ordering from both datasets while preserving first occurrence.
   */
  function mergeOrders(left, right) {
    const merged = [];
    const seen = new Set();

    left.concat(right).forEach((id) => {
      if (!seen.has(id)) {
        merged.push(id);
        seen.add(id);
      }
    });

    return merged;
  }

  /**
   * Normalize values by trimming and removing wrapping quotes.
   */
  function normalize(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"').trim();
    }
    return trimmed;
  }

  /**
   * Split a line into fields, handling CSV quotes and TSV tabs.
   */
  function splitLine(line, delimiter) {
    if (delimiter === "\t") {
      return line.split("\t");
    }
    return parseCsvLine(line, delimiter);
  }

  /**
   * CSV parser that respects quoted sections.
   */
  function parseCsvLine(line, delimiter) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * Provide a styled label for table status values.
   */
  function statusLabel(status) {
    switch (status) {
      case "MATCH":
        return "MATCH";
      case "DIFF":
        return "DIFF";
      case "MISSING":
        return "MISSING";
      case "INVALID":
        return "INVALID JSON";
      default:
        return status;
    }
  }

  /**
   * Generate a class name fragment for a given status.
   */
  function statusClassName(status) {
    return status.toLowerCase().replace(/\s+/g, "-");
  }

  /**
   * Generate quick statistics about highlighted differences.
   */
  function summarizeDiff(diff) {
    if (!diff?.changes) {
      return { changed: 0, added: 0, removed: 0 };
    }
    const { changed, added, removed } = diff.changes;
    return {
      changed: changed.size || 0,
      added: added.size || 0,
      removed: removed.size || 0
    };
  }

  function plural(count) {
    return count === 1 ? "" : "s";
  }

  /**
   * Basic HTML escaping for dynamic strings.
   */
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return map[char];
    });
  }

  /**
   * Remove trailing millisecond markers, null values, and comparison-exempt fields from parsed JSON.
   */
  function sanitizeData(value) {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      const sanitizedArray = value
        .map((item) => sanitizeData(item))
        .filter((item) => item !== undefined);
      return sanitizedArray;
    }

    if (typeof value === "object") {
      const sanitizedObject = {};
      Object.keys(value).forEach((key) => {
        if (key === "report_id") {
          return;
        }
        const sanitizedValue = sanitizeData(value[key]);
        if (sanitizedValue !== undefined) {
          sanitizedObject[key] = sanitizedValue;
        }
      });
      return sanitizedObject;
    }

    if (typeof value === "string") {
      return sanitizeString(value);
    }

    return value;
  }

  function sanitizeString(value) {
    if (!value.includes(".000")) {
      return value;
    }

    let cleaned = value.replace(/\.000Z\b/g, "");
    cleaned = cleaned.replace(/\.000\b/g, "");
    return cleaned;
  }

  /**
   * Lightweight deep comparison fallback when a diff engine is unavailable.
   */
  function deepEqual(left, right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (error) {
      return false;
    }
  }
})();
