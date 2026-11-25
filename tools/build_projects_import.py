"""Build the one-time import of the Monday.com "Projects Form & Board" into
public.projects.

Input: a JSON export scraped from the board's Main table (the shape the Monday
browser extraction produced: {"cols": {...}, "items": [{id, _group, _order,
<monday column id>: text, ...}]}).

Output: supabase/private/projects_import.sql, which Jeff pastes into the
Supabase SQL editor after running supabase/migrations/20261125_projects.sql.

The output holds client names, law firms and contact details. The repository
is public, so supabase/private/ is gitignored: never commit what this writes.

Re-running the SQL is safe: rows upsert on monday_id.

Usage: python3 tools/build_projects_import.py <export.json> [--year 2026]
"""

import argparse
import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'supabase', 'private', 'projects_import.sql')

BOARD_ID_PREFIX = '5156273947'

GROUPS = [
    'Incoming responses/In Progress',
    'Upcoming Projects',
    'Paused',
    'Completed Projects',
    'Irregular (On & Off Projects)',
    'Removed from the Project',
    'Rejected Projects',
]

# Monday column id -> public.projects column, and how to convert it.
TEXT = {
    'name': 'item_name',
    'short_text': 'agency',
    'short_text0': 'project_name',
    'short_text03': 'coders',
    'short_text9': 'supervisor',
    'short_text01': 'litigation_type',
    'single_select': 'status',
    'short_text3': 'remote_desktop',
    'short_text1': 'company_represented',
    'short_text90': 'firm_represented',
    'short_text7': 'opposing_company',
    'short_text65': 'opposing_firm',
    'short_text78': 'case_room_hours',
    'single_select7': 'weekend_allowed',
    'short_text63': 'proposed_length',
    'long_text': 'about',
    'single_select0': 'promoted_qc',
    'single_select5': 'promoted_tl',
    'short_text5': 'skills',
    'short_text58': 'project_managers',
    'text_mkxbb0ss': 'contact_email',
    'short_text24': 'team_leads',
}
NUMBER = {'numbers': 'coder_count', 'number': 'max_hours_day', 'number9': 'max_hours_week'}
DATE = {'date': 'start_date', 'date7': 'end_date'}
# review_platform6 is the dropdown; short_text04 is the free-text "other".
PLATFORM = ('review_platform6', 'short_text04')

MONTHS = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def parse_date(s, year):
    """Monday prints 'Jun 4' for the current year and 'Jan 21, 2025' otherwise."""
    if not s:
        return None
    m = re.fullmatch(r'([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?', s.strip())
    if not m:
        raise ValueError('unrecognised date: %r' % s)
    return dt.date(int(m.group(3) or year), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()


def parse_number(s):
    if not s:
        return None
    t = s.replace(',', '').strip()
    if not re.fullmatch(r'-?\d+(\.\d+)?', t):
        raise ValueError('unrecognised number: %r' % s)
    return t


def languages(s):
    """The table cell shows 'English / +1' when more labels are hidden."""
    if not s:
        return None, False
    parts = [p.strip() for p in s.split(' / ')]
    hidden = any(re.fullmatch(r'\+\d+', p) for p in parts)
    return ', '.join(p for p in parts if not re.fullmatch(r'\+\d+', p)), hidden


def sql(v):
    if v is None or v == '':
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def convert(item, year):
    row = {}
    mid = item['id']
    if mid.startswith(BOARD_ID_PREFIX) and len(mid) > len(BOARD_ID_PREFIX) + 6:
        mid = mid[len(BOARD_ID_PREFIX):]
    row['monday_id'] = mid
    if item['_group'] not in GROUPS:
        raise ValueError('unknown group %r on %s' % (item['_group'], mid))
    row['board_group'] = item['_group']
    row['sort_order'] = str(item['_order'] + 1)
    for k, col in TEXT.items():
        row[col] = (item.get(k) or '').strip() or None
    for k, col in NUMBER.items():
        row[col] = parse_number(item.get(k))
    for k, col in DATE.items():
        row[col] = parse_date(item.get(k), year)
    row['review_platform'] = (item.get(PLATFORM[0]) or item.get(PLATFORM[1]) or '').strip() or None
    row['languages'], hidden = languages(item.get('multi_select'))
    row['submitted_name'] = 'Imported from Monday.com'
    return row, hidden


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('export')
    ap.add_argument('--year', type=int, default=dt.date.today().year,
                    help='year Monday left off current-year dates (default: this year)')
    a = ap.parse_args()

    data = json.load(open(a.export, encoding='utf-8'))
    rows, hidden_langs = [], []
    for item in data['items']:
        row, hidden = convert(item, a.year)
        rows.append(row)
        if hidden:
            hidden_langs.append('%s (%s)' % (row['item_name'], row['project_name'] or '-'))

    cols = list(rows[0].keys())
    updates = ', '.join('%s = excluded.%s' % (c, c) for c in cols if c != 'monday_id')
    out = [
        '-- Generated by tools/build_projects_import.py from the Monday.com board.',
        '-- CONFIDENTIAL: client and law-firm names. Do not commit (repo is public).',
        '-- Run after supabase/migrations/20261125_projects.sql. Safe to re-run.',
        'begin;',
    ]
    for r in rows:
        out.append('insert into public.projects (%s) values (%s)\n  on conflict (monday_id) do update set %s;'
                   % (', '.join(cols), ', '.join(sql(r[c]) for c in cols), updates))
    out += [
        'commit;',
        '',
        '-- VERIFY: expect %d imported rows, by group:' % len(rows),
        "select board_group, count(*) from public.projects where monday_id is not null group by 1 order by 1;",
        '',
    ]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

    print('wrote %d rows to %s' % (len(rows), os.path.relpath(OUT)))
    counts = {}
    for r in rows:
        counts[r['board_group']] = counts.get(r['board_group'], 0) + 1
    for g in GROUPS:
        print('  %-32s %d' % (g, counts.get(g, 0)))
    if hidden_langs:
        print('\n%d items show "+N" more languages on Monday that the table hid:' % len(hidden_langs))
        for h in hidden_langs:
            print('  - ' + h)


if __name__ == '__main__':
    sys.exit(main())
