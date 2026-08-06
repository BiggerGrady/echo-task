import JSZip from "jszip";

export type CommentPayload = {
  id: number;
  body: string;
  author?: string;
  initials?: string;
};

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const COMMENTS_CT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
const COMMENTS_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

function buildCommentsXml(comments: CommentPayload[], dateIso: string): string {
  const items = comments
    .map((c) => {
      const paragraphs = c.body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
          (line) =>
            `<w:p><w:r><w:rPr><w:rStyle w:val="CommentText"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
        )
        .join("");
      return `<w:comment w:id="${c.id}" w:author="${escapeXml(c.author || "Echo Task")}" w:date="${dateIso}" w:initials="${escapeXml(c.initials || "ET")}">${paragraphs || `<w:p><w:r><w:t>${escapeXml(c.body)}</w:t></w:r></w:p>`}</w:comment>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="${W_NS}">${items}</w:comments>`;
}

function ensureContentTypes(xml: string): string {
  if (xml.includes("word/comments.xml")) return xml;
  const override = `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CT}"/>`;
  if (xml.includes("</Types>")) {
    return xml.replace("</Types>", `${override}</Types>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${CT_NS}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  ${override}
</Types>`;
}

function ensureDocumentRels(xml: string | null): string {
  if (!xml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rIdEchoComments" Type="${COMMENTS_REL}" Target="comments.xml"/>
</Relationships>`;
  }
  if (xml.includes(COMMENTS_REL) || xml.includes('Target="comments.xml"')) {
    return xml;
  }
  return xml.replace(
    "</Relationships>",
    `<Relationship Id="rIdEchoComments" Type="${COMMENTS_REL}" Target="comments.xml"/>
</Relationships>`
  );
}

type TextPiece = {
  fullStart: number;
  fullEnd: number;
  nodeIndex: number;
  raw: string;
};

/**
 * Collect text from <w:t> nodes and map into a whitespace-normalized full string
 * so we can locate issue snippets even when Word split runs.
 */
function collectTextPieces(documentXml: string): {
  full: string;
  pieces: TextPiece[];
  tRegex: RegExp;
} {
  const tRegex = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;
  const pieces: TextPiece[] = [];
  let full = "";
  let match: RegExpExecArray | null;
  let nodeIndex = 0;

  while ((match = tRegex.exec(documentXml)) !== null) {
    const raw = match[2]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    const normalized = normalizeText(raw);
    const fullStart = full.length;
    full += normalized;
    pieces.push({
      fullStart,
      fullEnd: full.length,
      nodeIndex,
      raw,
    });
    nodeIndex += 1;
  }

  return { full, pieces, tRegex: /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g };
}

function findNeedleRange(
  full: string,
  pieces: TextPiece[],
  needle: string
): { startNode: number; endNode: number } | null {
  const target = normalizeText(needle);
  if (!target) return null;

  let idx = full.indexOf(target);
  if (idx < 0 && target.length > 12) {
    idx = full.indexOf(target.slice(0, Math.min(24, target.length)));
  }
  if (idx < 0) return null;

  const endIdx = idx + Math.max(1, Math.min(target.length, full.length - idx));
  let startNode = -1;
  let endNode = -1;
  for (const p of pieces) {
    if (startNode < 0 && p.fullEnd > idx) startNode = p.nodeIndex;
    if (p.fullStart < endIdx) endNode = p.nodeIndex;
  }
  if (startNode < 0 || endNode < 0) return null;
  return { startNode, endNode };
}

function injectMarkers(
  documentXml: string,
  ranges: Array<{ id: number; startNode: number; endNode: number }>
): string {
  if (!ranges.length) return documentXml;

  const startsByNode = new Map<number, number[]>();
  const endsByNode = new Map<number, number[]>();
  for (const r of ranges) {
    const s = startsByNode.get(r.startNode) || [];
    s.push(r.id);
    startsByNode.set(r.startNode, s);
    const e = endsByNode.get(r.endNode) || [];
    e.push(r.id);
    endsByNode.set(r.endNode, e);
  }

  let nodeIndex = 0;
  return documentXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (full) => {
    const current = nodeIndex;
    nodeIndex += 1;
    const before = (startsByNode.get(current) || [])
      .map((id) => `<w:commentRangeStart w:id="${id}"/>`)
      .join("");
    const after = (endsByNode.get(current) || [])
      .map(
        (id) =>
          `<w:commentRangeEnd w:id="${id}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>`
      )
      .join("");
    return `${before}${full}${after}`;
  });
}

function attachFallbackToBodyEnd(documentXml: string, commentIds: number[]): string {
  if (!commentIds.length) return documentXml;
  const markers = commentIds
    .map(
      (id) =>
        `<w:commentRangeStart w:id="${id}"/><w:r><w:t xml:space="preserve"> </w:t></w:r><w:commentRangeEnd w:id="${id}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>`
    )
    .join("");
  const para = `<w:p>${markers}</w:p>`;
  if (documentXml.includes("</w:body>")) {
    return documentXml.replace("</w:body>", `${para}</w:body>`);
  }
  return `${documentXml}${para}`;
}

/**
 * Inject Word comments into an existing .docx while preserving original content/layout.
 */
export async function injectCommentsIntoDocx(
  originalBuffer: Buffer,
  comments: CommentPayload[]
): Promise<Buffer> {
  if (!comments.length) return originalBuffer;

  const zip = await JSZip.loadAsync(originalBuffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new Error("无效的 Word 文件：缺少 word/document.xml");
  }

  let documentXml = await documentFile.async("string");
  const { full, pieces } = collectTextPieces(documentXml);

  const matched: Array<{ id: number; startNode: number; endNode: number }> = [];
  const unmatchedIds: number[] = [];

  for (const c of comments) {
    // Prefer locating by first line after "原文：" if present in body text, else whole body needle is external.
    // Caller should pass searchableNeedle separately via embedding in body? We accept optional convention:
    // body may start with 【定位】snippet\n...
    const locateMatch = c.body.match(/^【定位】(.+?)(?:\n|$)/);
    const needle = locateMatch?.[1] || "";
    const range = needle ? findNeedleRange(full, pieces, needle) : null;
    if (range) matched.push({ id: c.id, ...range });
    else unmatchedIds.push(c.id);
  }

  if (matched.length) {
    documentXml = injectMarkers(documentXml, matched);
  }
  if (unmatchedIds.length) {
    documentXml = attachFallbackToBodyEnd(documentXml, unmatchedIds);
  }

  zip.file("word/document.xml", documentXml);
  zip.file(
    "word/comments.xml",
    buildCommentsXml(
      comments.map((c) => ({
        ...c,
        body: c.body.replace(/^【定位】.+?(?:\n|$)/, "").trim() || c.body,
      })),
      new Date().toISOString()
    )
  );

  const contentTypesFile = zip.file("[Content_Types].xml");
  const contentTypes = contentTypesFile ? await contentTypesFile.async("string") : "";
  zip.file("[Content_Types].xml", ensureContentTypes(contentTypes));

  const relsFile = zip.file("word/_rels/document.xml.rels");
  const rels = relsFile ? await relsFile.async("string") : null;
  zip.file("word/_rels/document.xml.rels", ensureDocumentRels(rels));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}
