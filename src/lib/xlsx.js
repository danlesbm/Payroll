// Ghi file .xlsx thuần Node (không cần thư viện ngoài): ô, kiểu (đậm/viền/màu/định dạng số), gộp ô, độ rộng cột, in ngang A4.
const zlib = require('zlib');
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => zlib.crc32 ? zlib.crc32(buf) : (() => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; })();

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const ref = (r, c) => colName(c) + r;

class Styles {
  constructor() {
    this.fonts = ['<font><sz val="11"/><name val="Times New Roman"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.fmts = []; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.cache = new Map();
  }
  idx(list, xml) { let i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return i; }
  get(st) {
    if (!st) return 0;
    const key = JSON.stringify(st); if (this.cache.has(key)) return this.cache.get(key);
    const font = `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}${st.u ? '<u/>' : ''}<sz val="${st.sz || 11}"/>${st.color ? `<color rgb="FF${st.color}"/>` : ''}<name val="Times New Roman"/></font>`;
    const fill = st.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>` : null;
    const line = st.border ? (st.border === 'dotted' ? 'dotted' : 'thin') : null;
    const side = n => line ? `<${n} style="${line}"><color auto="1"/></${n}>` : `<${n}/>`;
    const border = line ? `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>` : null;
    let numFmtId = 0;
    if (st.fmt) { let i = this.fmts.indexOf(st.fmt); if (i < 0) { this.fmts.push(st.fmt); i = this.fmts.length - 1; } numFmtId = 164 + i; }
    const xf = `<xf numFmtId="${numFmtId}" fontId="${this.idx(this.fonts, font)}" fillId="${fill ? this.idx(this.fills, fill) : 0}" borderId="${border ? this.idx(this.borders, border) : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${st.al || 'general'}" vertical="${st.va || 'center'}" wrapText="${st.wrap ? 1 : 0}"/></xf>`;
    const id = this.idx(this.xfs, xf); this.cache.set(key, id); return id;
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.fmts.length ? `<numFmts count="${this.fmts.length}">${this.fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

class Sheet {
  constructor(wb, name, opt = {}) {
    this.wb = wb; this.name = String(name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet';
    this.cells = new Map(); this.merges = []; this.widths = []; this.heights = new Map();
    this.landscape = opt.landscape !== false; this.printTitles = null; this.freeze = null; this.maxR = 0; this.maxC = 0;
  }
  // Định dạng số có phần thập phân tuỳ chọn ('#,##0.##'): số nguyên hiển thị không có dấu chấm thừa ("7" chứ không phải "7.")
  set(r, c, v, st) { if (st && st.fmt && typeof v === 'number' && Number.isInteger(v)) { const m = /^(.*?)\.#+$/.exec(st.fmt); if (m) st = { ...st, fmt: m[1] }; } this.cells.set(r * 100000 + c, { r, c, v, s: this.wb.styles.get(st) }); if (r > this.maxR) this.maxR = r; if (c > this.maxC) this.maxC = c; }
  // Ghi cả khối ô gộp (đủ viền)
  box(r1, c1, r2, c2, v, st) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.set(r, c, r === r1 && c === c1 ? v : null, st); if (r1 !== r2 || c1 !== c2) this.merges.push([r1, c1, r2, c2]); }
  merge(r1, c1, r2, c2) { this.merges.push([r1, c1, r2, c2]); }
  col(c, w) { this.widths[c] = w; }
  height(r, h) { this.heights.set(r, h); }
  xml() {
    const rows = new Map();
    for (const cell of this.cells.values()) (rows.get(cell.r) || rows.set(cell.r, []).get(cell.r)).push(cell);
    for (const r of this.heights.keys()) if (!rows.has(r)) rows.set(r, []);
    const body = [...rows.keys()].sort((a, b) => a - b).map(r => {
      const cs = rows.get(r).sort((a, b) => a.c - b.c).map(x => {
        const a = `r="${ref(x.r, x.c)}"${x.s ? ` s="${x.s}"` : ''}`;
        if (x.v === null || x.v === undefined || x.v === '') return `<c ${a}/>`;
        if (typeof x.v === 'number' && Number.isFinite(x.v)) return `<c ${a}><v>${x.v}</v></c>`;
        return `<c ${a} t="inlineStr"><is><t xml:space="preserve">${esc(x.v)}</t></is></c>`;
      }).join('');
      const h = this.heights.get(r);
      return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
    }).join('');
    const cols = this.widths.map((w, i) => w ? `<col min="${i}" max="${i}" width="${w}" customWidth="1"/>` : '').join('');
    const pane = this.freeze ? `<pane xSplit="${this.freeze[1]}" ySplit="${this.freeze[0]}" topLeftCell="${ref(this.freeze[0] + 1, this.freeze[1] + 1)}" activePane="bottomRight" state="frozen"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
      `<dimension ref="A1:${ref(Math.max(1, this.maxR), Math.max(1, this.maxC))}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
      (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${body}</sheetData>` +
      (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${ref(m[0], m[1])}:${ref(m[2], m[3])}"/>`).join('')}</mergeCells>` : '') +
      `<pageMargins left="0.4" right="0.3" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
}

class Workbook {
  constructor() { this.styles = new Styles(); this.sheets = []; }
  sheet(name, opt) {
    const s = new Sheet(this, name, opt);
    let n = s.name, k = 2; while (this.sheets.some(x => x.name === n)) n = s.name.slice(0, 28) + ' ' + k++;
    s.name = n; this.sheets.push(s); return s;
  }
  toBuffer() {
    const files = [];
    const add = (name, text) => files.push([name, Buffer.from(text, 'utf8')]);
    const sheetsXml = this.sheets.map(s => s.xml());   // xml() phải chạy trước styles.xml (đăng ký kiểu)
    add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    const titles = this.sheets.map((s, i) => s.printTitles ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(s.name).replace(/'/g, "''")}'!$${s.printTitles[0]}:$${s.printTitles[1]}</definedName>` : '').join('');
    add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${this.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${titles ? `<definedNames>${titles}</definedNames>` : ''}</workbook>`);
    add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add('xl/styles.xml', this.styles.xml());
    sheetsXml.forEach((x, i) => add(`xl/worksheets/sheet${i + 1}.xml`, x));
    return zip(files);
  }
}

function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, 'utf8'), comp = zlib.deflateRawSync(data), crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
module.exports = { Workbook, colName };
