"""Insert the approved restricted-provider preview into the fixed Proposal template."""

import base64
import copy
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

ROOT = Path(__file__).resolve().parent
BASE = Path('/Users/doristao/Documents/PP SME/PP SME  Proposal 模板.xlsx')
PREVIEW = ROOT / 'outputs/受限医院列表_版式预览_待确认.xlsx'
STATIC = ROOT / 'proposal-template-static.js'
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CONTENT = 'http://schemas.openxmlformats.org/package/2006/content-types'


def xml(data):
    return etree.fromstring(data)


def output(root):
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


with ZipFile(BASE) as base, ZipFile(PREVIEW) as preview:
    style = xml(base.read('xl/styles.xml'))
    preview_style = xml(preview.read('xl/styles.xml'))
    offsets = {}
    for kind in ('fonts', 'fills', 'borders'):
        dest = style.find(f'{{{MAIN}}}{kind}')
        src = preview_style.find(f'{{{MAIN}}}{kind}')
        offsets[kind] = len(dest)
        for child in src:
            dest.append(copy.deepcopy(child))
        dest.set('count', str(len(dest)))

    dest_formats = style.find(f'{{{MAIN}}}numFmts')
    src_formats = preview_style.find(f'{{{MAIN}}}numFmts')
    next_format = max([163] + [int(x.get('numFmtId')) for x in dest_formats]) + 1
    format_map = {}
    for item in src_formats:
        old = int(item.get('numFmtId'))
        if old < 164:
            continue
        format_map[old] = next_format
        new = copy.deepcopy(item)
        new.set('numFmtId', str(next_format))
        dest_formats.append(new)
        next_format += 1
    dest_formats.set('count', str(len(dest_formats)))

    dest_xfs = style.find(f'{{{MAIN}}}cellXfs')
    src_xfs = preview_style.find(f'{{{MAIN}}}cellXfs')
    style_offset = len(dest_xfs)
    for xf in src_xfs:
        new = copy.deepcopy(xf)
        for attr, group in (('fontId', 'fonts'), ('fillId', 'fills'), ('borderId', 'borders')):
            if new.get(attr) is not None:
                new.set(attr, str(int(new.get(attr)) + offsets[group]))
        number_format = int(new.get('numFmtId', '0'))
        if number_format in format_map:
            new.set('numFmtId', str(format_map[number_format]))
        dest_xfs.append(new)
    dest_xfs.set('count', str(len(dest_xfs)))

    new_sheet = xml(preview.read('xl/worksheets/sheet1.xml'))
    for cell in new_sheet.iter(f'{{{MAIN}}}c'):
        if cell.get('s') is not None:
            cell.set('s', str(int(cell.get('s')) + style_offset))

    workbook = xml(base.read('xl/workbook.xml'))
    sheets = workbook.find(f'{{{MAIN}}}sheets')
    assert len(sheets) == 7
    name = '受限医院 Restricted Providers'
    etree.SubElement(sheets, f'{{{MAIN}}}sheet', name=name, sheetId='8', attrib={f'{{{OFFICE_REL}}}id': 'rId11'})
    sheets.insert(4, sheets[-1])
    # The original template's five later sheets keep their own physical XML files.
    relationships = xml(base.read('xl/_rels/workbook.xml.rels'))
    etree.SubElement(relationships, f'{{{PKG_REL}}}Relationship', Id='rId11', Type=f'{OFFICE_REL}/worksheet', Target='worksheets/sheet8.xml')
    types = xml(base.read('[Content_Types].xml'))
    etree.SubElement(types, f'{{{CONTENT}}}Override', PartName='/xl/worksheets/sheet8.xml', ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')

    replacements = {
        'xl/styles.xml': output(style),
        'xl/workbook.xml': output(workbook),
        'xl/_rels/workbook.xml.rels': output(relationships),
        '[Content_Types].xml': output(types),
        'xl/worksheets/sheet8.xml': output(new_sheet),
    }
    buffer = BytesIO()
    with ZipFile(buffer, 'w') as final:
        for entry in base.infolist():
            final.writestr(entry, replacements.pop(entry.filename, base.read(entry.filename)))
        for filename, contents in replacements.items():
            final.writestr(filename, contents)

STATIC.write_text(
    '// Embedded from the approved Proposal template, with the fixed restricted-provider page.\n'
    '(function (root) {\n'
    '  root.PP_SME_PROPOSAL_TEMPLATE_BASE64 = "' + base64.b64encode(buffer.getvalue()).decode() + '";\n'
    '}(typeof globalThis !== "undefined" ? globalThis : this));\n',
    encoding='utf-8',
)
print(f'Embedded {name}: {len(buffer.getvalue())} bytes')
