(() => {
  "use strict";

  const JSONDiffEngine = {
    analyze,
    render
  };

  window.JSONDiffEngine = JSONDiffEngine;

  /**
   * Compute structural differences between two JSON-compatible values.
   * Returns change sets that can be used to render highlighted views.
   */
  function analyze(left, right) {
    const changes = {
      changed: new Set(),
      added: new Set(),
      removed: new Set()
    };

    walk(left, right, "", changes);

    const summary = {
      changed: changes.changed.size,
      added: changes.added.size,
      removed: changes.removed.size
    };

    return {
      isMatch: summary.changed === 0 && summary.added === 0 && summary.removed === 0,
      changes
    };
  }

  /**
   * Render a JSON value with inline diff highlights for the provided side.
   * Side may be "left" or "right" to indicate ETL vs MuleSoft perspectives.
   */
  function render(value, diffInfo, side) {
    const context = {
      side,
      changes: diffInfo?.changes || {
        changed: new Set(),
        added: new Set(),
        removed: new Set()
      }
    };

    return renderValue(value, "", context, 0);
  }

  function walk(left, right, path, changes) {
    const leftType = describeType(left);
    const rightType = describeType(right);

    if (leftType === "undefined" && rightType === "undefined") {
      return;
    }

    if (leftType === "undefined") {
      changes.added.add(path);
      return;
    }

    if (rightType === "undefined") {
      changes.removed.add(path);
      return;
    }

    if (leftType !== rightType) {
      changes.changed.add(path);
      return;
    }

    if (leftType === "object") {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      if (keys.size === 0) {
        return;
      }
      keys.forEach((key) => {
        const nextPath = joinPath(path, key);
        walk(left[key], right[key], nextPath, changes);
      });
      return;
    }

    if (leftType === "array") {
      const max = Math.max(left.length, right.length);
      if (left.length !== right.length) {
        changes.changed.add(path || "[]");
      }
      for (let index = 0; index < max; index += 1) {
        const nextPath = `${path}[${index}]`;
        walk(left[index], right[index], nextPath, changes);
      }
      return;
    }

    if (!isEqual(left, right)) {
      changes.changed.add(path);
    }
  }

  function renderValue(value, path, context, depth) {
    const type = describeType(value);
    const indent = makeIndent(depth);
    const highlightClass = pickHighlightClass(path, context);

    switch (type) {
      case "object":
        return wrapWithHighlight(renderObject(value, path, context, depth), highlightClass);
      case "array":
        return wrapWithHighlight(renderArray(value, path, context, depth), highlightClass);
      case "string":
      case "number":
      case "boolean":
      case "null":
        return wrapWithHighlight(`${indent}${formatPrimitive(value)}`, highlightClass);
      default:
        return wrapWithHighlight(`${indent}${formatPrimitive(null)}`, highlightClass);
    }
  }

  function renderObject(objectValue, path, context, depth) {
    const keys = Object.keys(objectValue);
    const indent = makeIndent(depth);
    const nextIndent = makeIndent(depth + 1);

    if (!keys.length) {
      return `${indent}{}`;
    }

    const lines = [`${indent}{`];

    keys.forEach((key, index) => {
      const nextPath = joinPath(path, key);
      const valueHtml = renderValue(objectValue[key], nextPath, context, depth + 1);
      const line = `${nextIndent}<span class="json-key">"${escapeHtml(key)}"</span>: ${stripIndent(valueHtml)}${index < keys.length - 1 ? "," : ""}`;
      lines.push(applyLineHighlight(line, nextPath, context));
    });

    lines.push(`${indent}}`);
    return lines.join("\n");
  }

  function renderArray(arrayValue, path, context, depth) {
    const indent = makeIndent(depth);
    const nextIndent = makeIndent(depth + 1);

    if (!arrayValue.length) {
      return `${indent}[]`;
    }

    const lines = [`${indent}[`];

    arrayValue.forEach((item, index) => {
      const nextPath = `${path}[${index}]`;
      const valueHtml = renderValue(item, nextPath, context, depth + 1);
      const line = `${nextIndent}${stripIndent(valueHtml)}${index < arrayValue.length - 1 ? "," : ""}`;
      lines.push(applyLineHighlight(line, nextPath, context));
    });

    lines.push(`${indent}]`);
    return lines.join("\n");
  }

  function applyLineHighlight(content, path, context) {
    const highlightClass = pickHighlightClass(path, context);
    return wrapWithHighlight(content, highlightClass);
  }

  function pickHighlightClass(path, context) {
    const { side, changes } = context;
    if (!path || path === "[]") {
      if (changes.changed.has("") || changes.changed.has("[]")) {
        return "diff-changed";
      }
      if (side === "left" && (changes.removed.has("") || changes.removed.has("[]"))) {
        return "diff-removed";
      }
      if (side === "right" && (changes.added.has("") || changes.added.has("[]"))) {
        return "diff-added";
      }
      return "";
    }

    if (changes.changed.has(path)) {
      return "diff-changed";
    }

    if (side === "left" && changes.removed.has(path)) {
      return "diff-removed";
    }

    if (side === "right" && changes.added.has(path)) {
      return "diff-added";
    }

    return "";
  }

  function wrapWithHighlight(content, className) {
    if (!className) {
      return content;
    }
    return `<span class="${className}">${content}</span>`;
  }

  function stripIndent(value) {
    return value
      .replace(/^\s+/g, "")
      .replace(/^<span([^>]*)>\s+/g, "<span$1>");
  }

  function makeIndent(level) {
    return "  ".repeat(level);
  }

  function joinPath(base, key) {
    return base ? `${base}.${key}` : `${key}`;
  }

  function describeType(value) {
    if (value === null) {
      return "null";
    }
    if (Array.isArray(value)) {
      return "array";
    }
    return typeof value;
  }

  function isEqual(a, b) {
    return a === b;
  }

  function formatPrimitive(value) {
    return escapeHtml(JSON.stringify(value));
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => {
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
})();
