(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PPProposalTemplateLock = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FROZEN_SHEET_PATHS = [
    "xl/worksheets/sheet4.xml",
    "xl/worksheets/sheet5.xml",
    "xl/worksheets/sheet6.xml",
    "xl/worksheets/sheet7.xml",
  ];

  function decodeBase64(base64) {
    if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(base64, "base64"));
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function part(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    if (!match) throw new Error(`Missing ${tag} in XLSX styles.xml`);
    return { full: match[0], inner: match[1], count: (match[1].match(/<[^/][^>]*?(?:\/>|>[\s\S]*?<\/[^>]+>)/g) || []).length };
  }

  function replacePart(xml, tag, inner, count) {
    return xml.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`), `<${tag} count="${count}">${inner}</${tag}>`);
  }

  function remapAttribute(fragment, name, offset) {
    return fragment.replace(new RegExp(`\\b${name}="(\\d+)"`, "g"), (_, value) => `${name}="${Number(value) + offset}"`);
  }

  function mergeStyles(templateXml, generatedXml) {
    const names = ["fonts", "fills", "borders"];
    const template = Object.fromEntries(names.map(name => [name, part(templateXml, name)]));
    const generated = Object.fromEntries(names.map(name => [name, part(generatedXml, name)]));
    let merged = templateXml;
    names.forEach(name => {
      merged = replacePart(merged, name, template[name].inner + generated[name].inner, template[name].count + generated[name].count);
    });

    const templateNumFmts = part(templateXml, "numFmts");
    const generatedNumFmts = part(generatedXml, "numFmts");
    const usedNumFmtIds = [...templateNumFmts.inner.matchAll(/numFmtId="(\d+)"/g)].map(match => Number(match[1]));
    let nextNumFmtId = Math.max(163, ...usedNumFmtIds) + 1;
    const numFmtMap = new Map();
    let generatedNumFmtInner = generatedNumFmts.inner.replace(/numFmtId="(\d+)"/g, (_, id) => {
      const number = Number(id);
      if (number < 164) return `numFmtId="${number}"`;
      const mapped = nextNumFmtId;
      nextNumFmtId += 1;
      numFmtMap.set(number, mapped);
      return `numFmtId="${mapped}"`;
    });
    merged = replacePart(merged, "numFmts", templateNumFmts.inner + generatedNumFmtInner, templateNumFmts.count + generatedNumFmts.count);

    const templateXfs = part(templateXml, "cellXfs");
    const generatedXfs = part(generatedXml, "cellXfs");
    const remappedXfs = generatedXfs.inner.replace(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g, xf => {
      let next = remapAttribute(xf, "fontId", template.fonts.count);
      next = remapAttribute(next, "fillId", template.fills.count);
      next = remapAttribute(next, "borderId", template.borders.count);
      next = next.replace(/numFmtId="(\d+)"/g, (_, id) => `numFmtId="${numFmtMap.get(Number(id)) || id}"`);
      return next;
    });
    merged = replacePart(merged, "cellXfs", templateXfs.inner + remappedXfs, templateXfs.count + generatedXfs.count);
    return { xml: merged, styleOffset: templateXfs.count };
  }

  function mergeSharedStrings(templateXml, generatedXml) {
    const templateItems = (templateXml.match(/<si>[\s\S]*?<\/si>/g) || []);
    const generatedItems = (generatedXml.match(/<si>[\s\S]*?<\/si>/g) || []);
    const count = Number((templateXml.match(/\bcount="(\d+)"/) || [, 0])[1]) + Number((generatedXml.match(/\bcount="(\d+)"/) || [, 0])[1]);
    const uniqueCount = templateItems.length + generatedItems.length;
    return {
      xml: templateXml.replace(/<sst\b[^>]*>[\s\S]*?<\/sst>/, `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${count}" uniqueCount="${uniqueCount}">${templateItems.join("")}${generatedItems.join("")}</sst>`),
      offset: templateItems.length,
    };
  }

  function remapDynamicSheet(xml, styleOffset, stringOffset) {
    let remapped = xml.replace(/<c\b([^>]*\bt="s"[^>]*)>([\s\S]*?<v>)(\d+)(<\/v>[\s\S]*?<\/c>)/g, (_, attributes, before, index, after) => `<c${attributes}>${before}${Number(index) + stringOffset}${after}`);
    remapped = remapped.replace(/<c\b([^>]*?)\bs="(\d+)"([^>]*)/g, (_, before, styleId, after) => `<c${before}s="${Number(styleId) + styleOffset}"${after}`);
    return remapped;
  }

  async function lockToProposalTemplate(generatedBytes, { JSZip, templateBase64 } = {}) {
    if (!JSZip || !templateBase64) throw new Error("Proposal template is unavailable; export is intentionally stopped to protect the frozen sheets.");
    const [templateZip, generatedZip] = await Promise.all([
      JSZip.loadAsync(decodeBase64(templateBase64)),
      JSZip.loadAsync(generatedBytes),
    ]);
    const [templateStyles, generatedStyles, templateStrings, generatedStrings] = await Promise.all([
      templateZip.file("xl/styles.xml").async("string"),
      generatedZip.file("xl/styles.xml").async("string"),
      templateZip.file("xl/sharedStrings.xml").async("string"),
      generatedZip.file("xl/sharedStrings.xml").async("string"),
    ]);
    const styles = mergeStyles(templateStyles, generatedStyles);
    const strings = mergeSharedStrings(templateStrings, generatedStrings);
    templateZip.file("xl/styles.xml", styles.xml);
    templateZip.file("xl/sharedStrings.xml", strings.xml);
    for (let index = 1; index <= 3; index += 1) {
      const xml = await generatedZip.file(`xl/worksheets/sheet${index}.xml`).async("string");
      templateZip.file(`xl/worksheets/sheet${index}.xml`, remapDynamicSheet(xml, styles.styleOffset, strings.offset));
    }
    return templateZip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  return { FROZEN_SHEET_PATHS, lockToProposalTemplate };
}));
