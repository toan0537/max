(() => {
  const STATE_KEY = "__maxFigmaLabCodeState";
  const INLINE_TAGS = new Set(["SPAN", "A", "STRONG", "EM", "SMALL", "B", "I", "LABEL"]);
  const state = window[STATE_KEY];
  if (!state || typeof state !== "object") return;

  function toNumber(value) {
    const next = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(next) ? next : 0;
  }

  function parseSegment(segment) {
    const match = /^([a-z0-9-]+)(#[a-zA-Z0-9_-]+)?(?::(\d+))?$/i.exec(segment || "");
    if (!match) return null;
    return {
      tag: match[1].toUpperCase(),
      id: match[2] ? match[2].slice(1) : "",
      index: match[3] ? Number.parseInt(match[3], 10) : 1
    };
  }

  function findChildBySegment(parent, part) {
    if (!parent || !part) return null;
    const children = Array.from(parent.children).filter((child) => {
      if (!(child instanceof Element)) return false;
      if (child.tagName !== part.tag) return false;
      if (part.id && child.id !== part.id) return false;
      return true;
    });
    return children[part.index - 1] || null;
  }

  function resolveRef(ref) {
    if (typeof ref !== "string" || !ref.trim()) return null;
    const segments = ref.split("/").filter(Boolean);
    if (!segments.length) return null;
    const first = parseSegment(segments[0]);
    if (!first) return null;
    let node = first.id ? document.getElementById(first.id) : null;
    if (!node) {
      const roots = Array.from(document.querySelectorAll(first.tag.toLowerCase())).filter((el) => {
        if (!(el instanceof Element)) return false;
        if (first.id && el.id !== first.id) return false;
        return true;
      });
      node = roots[first.index - 1] || null;
    }
    for (let i = 1; node && i < segments.length; i += 1) {
      node = findChildBySegment(node, parseSegment(segments[i]));
    }
    return node instanceof Element ? node : null;
  }

  function canEditText(node) {
    if (!(node instanceof Element)) return false;
    return Array.from(node.children).every((child) => child.tagName === "BR");
  }

  function applyEdit(node, edit) {
    if (!node || !edit || typeof edit !== "object") return;
    const tx = toNumber(edit.translateX);
    const ty = toNumber(edit.translateY);
    if (tx || ty) {
      node.style.translate = `${tx}px ${ty}px`;
    }
    const inline = INLINE_TAGS.has(node.tagName) && (edit.width || edit.height);
    if (inline) {
      node.style.display = "inline-block";
    }
    if (edit.width) node.style.width = `${toNumber(edit.width)}px`;
    if (edit.height) node.style.height = `${toNumber(edit.height)}px`;
    if (edit.color) node.style.color = edit.color;
    if (edit.backgroundColor) node.style.backgroundColor = edit.backgroundColor;
    if (edit.opacity !== undefined && edit.opacity !== "") node.style.opacity = `${edit.opacity}`;
    if (edit.borderRadius) node.style.borderRadius = `${toNumber(edit.borderRadius)}px`;
    if (edit.fontSize) node.style.fontSize = `${toNumber(edit.fontSize)}px`;
    if (edit.lineHeight) node.style.lineHeight = `${toNumber(edit.lineHeight)}`;
    if (edit.letterSpacing) node.style.letterSpacing = `${toNumber(edit.letterSpacing)}px`;
    if (edit.wordSpacing) node.style.wordSpacing = `${toNumber(edit.wordSpacing)}px`;
    if (edit.fontWeight) node.style.fontWeight = `${edit.fontWeight}`;
    if (edit.textAlign) node.style.textAlign = edit.textAlign;
    if (typeof edit.text === "string" && canEditText(node)) {
      node.textContent = edit.text;
    }
  }

  function applyAll() {
    const edits = state.edits && typeof state.edits === "object" ? state.edits : {};
    Object.entries(edits).forEach(([ref, edit]) => {
      applyEdit(resolveRef(ref), edit);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll, { once: true });
  } else {
    applyAll();
  }
  addEventListener("load", applyAll, { once: true });
  setTimeout(applyAll, 600);
})();
