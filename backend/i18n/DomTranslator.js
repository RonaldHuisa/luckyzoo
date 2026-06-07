import { useEffect } from "react";
import { translateText, useI18n } from "./I18nContext";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function shouldSkip(node) {
  const parent = node?.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("[data-no-translate='true']")) return true;
  return false;
}

function translateTextNode(node, language) {
  if (shouldSkip(node)) return;
  const current = node.nodeValue;
  const trimmed = current.replace(/\s+/g, " ").trim();
  if (!trimmed) return;

  const translated = translateText(trimmed, language);
  if (translated !== trimmed) {
    node.nodeValue = current.replace(trimmed, translated);
  }
}

function translateAttributes(element, language) {
  ["placeholder", "aria-label", "title", "alt"].forEach((attr) => {
    if (!element.hasAttribute(attr)) return;
    const current = element.getAttribute(attr);
    const translated = translateText(current, language);
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
