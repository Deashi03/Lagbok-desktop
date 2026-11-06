#!/usr/bin/env python3
"""One-way, conservative three-way sync: Lagbok -> Lagbok Desktop.

Only files shared by the two apps are candidates for updates. The original
Lagbok repository is *never* written to. Desktop customizations are merged
from the last known upstream revision, or the sync fails without applying
partial changes. Intended for an unattended GitHub Actions job.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT / '.lagbok-upstream.json'
REPOSITORY = 'Deashi03/Lagbok'
VERSION_RE = re.compile(rb"const APP_VERSION='[^'\r\n]*';")
FILES_RE = re.compile(r"const FILES=\[([^\r\n]*?)\];")
ALLOWED = ('assets/', 'data/', 'scripts/', 'tests/')
SPECIAL = {'index.html', 'icon.svg'}
KEEP = {
    'assets/desktop.js', 'assets/lagboken.js', 'scripts/stage.js',
    'scripts/sync_from_lagbok.py', 'tests/test_upstream_sync.py',
}
MAX_TEXT_MERGE_BYTES = 2 * 1024 * 1024


def git(*args: str, input_data: bytes | None = None, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(['git', *args], cwd=ROOT, input=input_data,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f'git {" ".join(args)}: {result.stderr.decode(errors="replace")[:1500]}')
    return result


def upstream_file(revision: str, path: str) -> bytes | None:
    result = git('show', f'{revision}:{path}', check=False)
    if result.returncode:
        return None
    return result.stdout


def is_shared(path: str) -> bool:
    if path in KEEP or path.startswith(('src-tauri/', '.github/', 'splash/', 'tests/browser/')):
        return False
    return path in SPECIAL or path.startswith(ALLOWED)


def merge_text(local: bytes, base: bytes, newer: bytes, path: str) -> bytes:
    # The desktop app has its own independent version. A mobile version bump
    # must not cause a merge conflict or change the desktop release version.
    if path == 'assets/app.js':
        match = VERSION_RE.search(local)
        if not match or not VERSION_RE.search(base) or not VERSION_RE.search(newer):
            raise ValueError('APP_VERSION could not be safely preserved')
        version = match.group(0)
        base = VERSION_RE.sub(lambda _: version, base, count=1)
        newer = VERSION_RE.sub(lambda _: version, newer, count=1)

    if max(map(len, (local, base, newer))) > MAX_TEXT_MERGE_BYTES:
        raise ValueError('Locally customized file too large for an automatic text merge')
    if any(b'\0' in item for item in (local, base, newer)):
        raise ValueError('Locally customized binary file cannot be merged automatically')
    try:
        for item in (local, base, newer):
            item.decode('utf-8')
    except UnicodeDecodeError as exc:
        raise ValueError('Locally customized non-UTF-8 file cannot be merged') from exc

    with tempfile.TemporaryDirectory() as td:
        loc, old, new = (Path(td) / name for name in ('desktop', 'base', 'upstream'))
        loc.write_bytes(local)
        old.write_bytes(base)
        new.write_bytes(newer)
        result = git('merge-file', '--stdout', '--diff3', str(loc), str(old), str(new), check=False)
        if result.returncode:
            raise ValueError('Three-way merge conflict (Desktop change overlaps with Lagbok change)')
        return result.stdout


def bundle_files(blob: bytes) -> list[str]:
    text = blob.decode('utf-8')
    match = FILES_RE.search(text)
    if not match:
        raise ValueError('Unrecognized scripts/bundle.js FILES list; manual sync needed')
    names = re.findall(r"'([^']+)'", match.group(1))
    if not names or len(names) != len(set(names)):
        raise ValueError('Invalid scripts/bundle.js FILES list')
    return names


def sync_bundle(local: bytes, base: bytes, newer: bytes) -> bytes:
    # The bundler algorithm is shared. Only its module list is automatically
    # adapted: desktop.js MUST remain the last module in the desktop bundle.
    old_names, new_names = bundle_files(base), bundle_files(newer)
    if old_names == new_names:
        # An upstream bundler implementation changed; do not silently ignore.
        if newer != base:
            raise ValueError('Upstream bundler changed outside FILES; needs desktop integration')
        return local
    old_text, new_text = base.decode(), newer.decode()
    old_match = FILES_RE.search(old_text)
    new_match = FILES_RE.search(new_text)
    if (old_text[:old_match.start()] + old_text[old_match.end():] !=
            new_text[:new_match.start()] + new_text[new_match.end():]):
        raise ValueError('Upstream bundler algorithm also changed; manual integration needed')
    local_text = local.decode('utf-8')
    local_match = FILES_RE.search(local_text)
    if not local_match:
        raise ValueError('Desktop bundler list missing')
    desktop_names = bundle_files(local)
    if desktop_names[-1] != 'desktop.js':
        raise ValueError('desktop.js is not last in the desktop bundler')
    # Protect desktop modules (if any are added after the current version).
    additions = [n for n in desktop_names if n not in old_names and n != 'desktop.js']
    names = [*new_names, *additions, 'desktop.js']
    encoded = 'const FILES=[' + ','.join(repr(n) for n in names) + '];'
    return (local_text[:local_match.start()] + encoded + local_text[local_match.end():]).encode('utf-8')


def check_desktop_integrations(planned: dict[str, bytes | None]) -> None:
    # Never accept a sync that strips known Windows-only integration points.
    guards = {
        'assets/app.js': (b"const APP_NAME='Lagbok Desktop'", b'window.LAGBOK_DESKTOP'),
        'assets/app.css': (b'/* ---------- Lagbok Desktop ---------- */',),
        'index.html': (b'window.LAGBOK_DESKTOP', b'<title>Lagbok Desktop</title>'),
        'assets/tutorial.js': (b'V\xc3\xa4lkommen till Lagbok Desktop',),
    }
    for path, required in guards.items():
        content = planned.get(path, (ROOT / path).read_bytes())
        if content is None or not all(fragment in content for fragment in required):
            raise ValueError(f'Windows-specific integration has been lost in {path}')
    bundler = planned.get('scripts/bundle.js', (ROOT / 'scripts/bundle.js').read_bytes())
    if bundler is None or bundle_files(bundler)[-1] != 'desktop.js':
        raise ValueError('desktop.js must remain the final bundle module')


def synchronize(new_ref: str, dry_run: bool = False) -> tuple[int, int]:
    state = json.loads(STATE_FILE.read_text('utf-8'))
    if state.get('repository') != REPOSITORY:
        raise ValueError('Unexpected source repository in sync state')
    base = state['commit']
    sha = git('rev-parse', new_ref).stdout.decode().strip()
    if not re.fullmatch(r'[a-f0-9]{40}', base) or not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('Invalid source commit SHA')
    if sha == base:
        print(f'Lagbok is already synchronized at {sha[:12]}.')
        return 0, 0
    if git('status', '--porcelain').stdout.strip():
        raise ValueError('Refusing to sync into a dirty desktop working tree')

    diff = git('diff', '--no-renames', '--name-status', '-z', base, sha).stdout
    entries = diff.split(b'\0')
    changes: list[tuple[str, str]] = []
    for i in range(0, len(entries) - 1, 2):
        status, raw_path = entries[i:i+2]
        if not status or not raw_path:
            continue
        path = raw_path.decode('utf-8')
        if status.decode() not in ('A', 'D', 'M', 'T'):
            raise ValueError(f'Unsupported upstream change type {status!r}: {path}')
        changes.append((status.decode(), path))

    planned: dict[str, bytes | None] = {}
    ignored: list[str] = []
    errors: list[str] = []
    for status, path in changes:
        if path == 'scripts/bundle.js':
            old = upstream_file(base, path)
            new = upstream_file(sha, path)
            if old is None or new is None:
                errors.append('scripts/bundle.js removed or added unexpectedly')
                continue
            try:
                planned[path] = sync_bundle((ROOT / path).read_bytes(), old, new)
            except (ValueError, UnicodeDecodeError) as exc:
                errors.append(f'{path}: {exc}')
            continue
        if not is_shared(path):
            ignored.append(path)
            continue
        current = ROOT / path
        old = upstream_file(base, path)
        new = upstream_file(sha, path)
        local = current.read_bytes() if current.is_file() else None
        try:
            if local == new:
                continue
            if local == old:
                planned[path] = new
            elif old is None:
                raise ValueError('New upstream file collides with an existing Desktop file')
            elif new is None:
                raise ValueError('Deleted upstream file has Desktop-specific edits')
            elif local is None:
                raise ValueError('Desktop deleted this upstream file; needs manual review')
            else:
                planned[path] = merge_text(local, old, new, path)
        except ValueError as exc:
            errors.append(f'{path}: {exc}')

    if errors:
        raise ValueError('Sync blocked; NO FILES WERE CHANGED:\n- ' + '\n- '.join(errors))
    check_desktop_integrations(planned)
    print(f'Source {base[:12]} -> {sha[:12]}; planned {len(planned)} file changes; mobile-only ignored: {len(ignored)}')
    if ignored:
        print('Excluded upstream changes: ' + ', '.join(ignored[:30]))
    if dry_run:
        return len(planned), len(ignored)

    for path, content in planned.items():
        target = ROOT / path
        if content is None:
            target.unlink(missing_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    state['commit'] = sha
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    # Regenerate desktop bundle after merging shared modules; the Windows
    # integration script remains last in the desktop bundler.
    result = subprocess.run(['node', 'scripts/bundle.js'], cwd=ROOT)
    if result.returncode:
        raise RuntimeError('Could not regenerate desktop JavaScript bundle')
    return len(planned), len(ignored)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref', default='refs/remotes/lagbok-upstream/main')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        synchronize(args.source_ref, args.dry_run)
    except (RuntimeError, ValueError, OSError, KeyError) as exc:
        print(f'LAGBOK DESKTOP SYNC FAILED: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
