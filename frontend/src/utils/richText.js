import React from "react";

function safeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "#";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return "#";
}

export function renderInlineFormat(text, keyPrefix = "rt") {
  const source = String(text || "");
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)|\*[^*]+\*|_[^_]+_)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let index = 0;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[") && token.includes("](")) {
      const label = token.slice(1, token.indexOf("]("));
      const href = token.slice(token.indexOf("](") + 2, -1);
      nodes.push(<a key={key} href={safeUrl(href)} target="_blank" rel="noopener noreferrer">{label}</a>);
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

function flushParagraph(blocks, paragraphLines, keyPrefix) {
  if (!paragraphLines.length) return;
  const text = paragraphLines.join("\n");
  blocks.push(<p key={`${keyPrefix}-p-${blocks.length}`}>{renderInlineFormat(text, `${keyPrefix}-p-${blocks.length}`)}</p>);
  paragraphLines.length = 0;
}

function flushList(blocks, listItems, listType, keyPrefix) {
  if (!listItems.length) return;
  const Tag = listType === "ol" ? "ol" : "ul";
  blocks.push(
    <Tag key={`${keyPrefix}-${listType}-${blocks.length}`}>
      {listItems.map((item, idx) => <li key={idx}>{renderInlineFormat(item, `${keyPrefix}-${listType}-${blocks.length}-${idx}`)}</li>)}
    </Tag>
  );
  listItems.length = 0;
}

export function renderRichTextBlocks(text, keyPrefix = "rt") {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  const paragraphLines = [];
  const listItems = [];
  let listType = "ul";

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(blocks, paragraphLines, keyPrefix);
      flushList(blocks, listItems, listType, keyPrefix);
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(blocks, paragraphLines, keyPrefix);
      flushList(blocks, listItems, listType, keyPrefix);
      const level = heading[1].length;
      const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
      blocks.push(<Tag key={`${keyPrefix}-h-${blocks.length}`}>{renderInlineFormat(heading[2], `${keyPrefix}-h-${blocks.length}`)}</Tag>);
      return;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph(blocks, paragraphLines, keyPrefix);
      flushList(blocks, listItems, listType, keyPrefix);
      blocks.push(<blockquote key={`${keyPrefix}-q-${blocks.length}`}>{renderInlineFormat(quote[1], `${keyPrefix}-q-${blocks.length}`)}</blockquote>);
      return;
    }

    const unordered = trimmed.match(/^[-•]\s+(.+)$/);
    if (unordered) {
      flushParagraph(blocks, paragraphLines, keyPrefix);
      if (listItems.length && listType !== "ul") flushList(blocks, listItems, listType, keyPrefix);
      listType = "ul";
      listItems.push(unordered[1]);
      return;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph(blocks, paragraphLines, keyPrefix);
      if (listItems.length && listType !== "ol") flushList(blocks, listItems, listType, keyPrefix);
      listType = "ol";
      listItems.push(ordered[1]);
      return;
    }

    flushList(blocks, listItems, listType, keyPrefix);
    paragraphLines.push(line);
  });

  flushParagraph(blocks, paragraphLines, keyPrefix);
  flushList(blocks, listItems, listType, keyPrefix);
  return blocks;
}
