"""Build searchable source pages/tables without inventing schemas from PDF indentation.

Build dependency: pip install pdfplumber. Runtime package has no Python dependency.
"""
import argparse
import hashlib
import json
from pathlib import Path

import pdfplumber

parser = argparse.ArgumentParser()
parser.add_argument('pdf', type=Path)
parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'data/manual')
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)

with pdfplumber.open(args.pdf) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        tables = []
        bottom = 0
        for table in page.find_tables():
            context = ''
            if table.bbox[1] > bottom:
                context = page.crop((0, bottom, page.width, table.bbox[1])).extract_text() or ''
            tables.append({'contextBefore': context, 'rows': table.extract()})
            bottom = table.bbox[3]
        record = {'page': number, 'text': page.extract_text() or '', 'tables': tables}
        # Keep page and row boundaries stable for rg and bounded agent reads.
        lines = ['{', '  "page": ' + str(number) + ',',
                 '  "text": ' + json.dumps(record['text'], ensure_ascii=False) + ',', '  "tables": [']
        for i, table in enumerate(tables):
            lines.append('    {"contextBefore": ' + json.dumps(table['contextBefore'], ensure_ascii=False) + ', "rows": [')
            for j, row in enumerate(table['rows']):
                lines.append('      ' + json.dumps(row, ensure_ascii=False) + (',' if j + 1 < len(table['rows']) else ''))
            lines.append('    ]}' + (',' if i + 1 < len(tables) else ''))
        lines.extend(['  ]', '}'])
        (args.out / f'{number:03}.json').write_text('\n'.join(lines) + '\n')
        if number % 25 == 0:
            print(f'Extracted {number}/{len(pdf.pages)} manual pages', flush=True)
    metadata = {'title': 'PixelFlow OpenAPI Manual V2.0.1', 'file': args.pdf.name,
                'sha256': hashlib.sha256(args.pdf.read_bytes()).hexdigest(), 'pageCount': len(pdf.pages),
                'tablePolicy': 'Original flat cells; row hierarchy is not a validated JSON schema.'}
    (args.out / 'index.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Extracted all {len(pdf.pages)} manual pages', flush=True)
