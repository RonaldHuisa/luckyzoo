import { useEffect } from "react";
import { translateText, useI18n } from "./I18nContext";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
const ORIGINAL_ATTR_PREFIX = "data-i18n-original-";

function shouldSkip(node) {
  const parent = node?.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("[data-no-translate='true']")) return true;
  return false;
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isDynamicValue(value) {
  const text = normalize(value);
  if (!text) return false;

  // No traducir saldos, porcentajes, niveles dinámicos, contadores, fechas u otros valores
  // que React actualiza desde la API. Si se traducen como texto normal, el traductor
  // puede volverlos al valor inicial, por ejemplo 0.00.
  return (
    /^[-$+]?\s*[\d,.]+(\s*(USDT|%|días|dias|days|GH\/s|h|horas|hours|>|›))?$/i.test(text) ||
    /^[-$+]?\s*[\d,.]+\s*\/\s*[\d,.]+$/i.test(text) ||
    /^\d{1,3}:\d{2}:\d{2}$/.test(text) ||
    /\d{1,3}:\d{2}:\d{2}/.test(text) ||
    /^Mining-\d+$/i.test(text) ||
    /^GreenVest-\d+$/i.test(text) ||
    /^VIP\s*\d+$/i.test(text) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}/.test(text) ||
    /^\d{4}-\d{2}-\d{2}/.test(text)
  );
}

function translateTextNode(node, language) {
  if (shouldSkip(node)) return;

  const current = node.nodeValue || "";
  const trimmed = normalize(current);
  if (!trimmed || isDynamicValue(trimmed)) return;

  // Guardamos el texto original por nodo para poder volver de EN → ES
  // sin quedarse con textos pegados en inglés luego de cambiar idioma.
  const original = node.__i18nOriginalText || trimmed;
  node.__i18nOriginalText = original;

  const translated = language === "es" ? original : translateText(original, "en");
  if (translated && translated !== trimmed) {
    node.nodeValue = current.replace(trimmed, translated);
  }
}

function translateAttributes(element, language) {
  ["placeholder", "aria-label", "title", "alt"].forEach((attr) => {
    if (!element.hasAttribute(attr)) return;

    const current = element.getAttribute(attr) || "";
    const trimmed = normalize(current);
    if (!trimmed) return;

    const storageAttr = `${ORIGINAL_ATTR_PREFIX}${attr}`;
    const original = element.getAttribute(storageAttr) || trimmed;
    if (!element.hasAttribute(storageAttr)) element.setAttribute(storageAttr, original);

    const translated = language === "es" ? original : translateText(original, "en");
    if (translated !== current) element.setAttribute(attr, translated);
  });
}

function translateTree(root, language) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, language);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    if (root.closest("[data-no-translate='true']")) return;
    translateAttributes(root, language);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
    if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node, language);
    node = walker.nextNode();
  }
}

export default function DomTranslator() {
  const { language } = useI18n();

  useEffect(() => {
    const apply = () => translateTree(document.body, language);
    const frame = requestAnimationFrame(apply);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => translateTree(node, language));
        if (mutation.type === "characterData") translateTree(mutation.target, language);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [language]);

  return null;
}
