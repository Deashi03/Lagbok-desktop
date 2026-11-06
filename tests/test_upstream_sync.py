"""Safety tests for the one-way Lagbok -> Lagbok Desktop updater."""

import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'scripts' / 'sync_from_lagbok.py'
spec = importlib.util.spec_from_file_location('lagbok_sync', MODULE)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncSafetyTests(unittest.TestCase):
    def test_only_shared_paths_are_eligible(self):
        self.assertTrue(sync.is_shared('assets/app.js'))
        self.assertTrue(sync.is_shared('data/laws/1962-700.json'))
        self.assertTrue(sync.is_shared('scripts/import_laws.py'))
        self.assertTrue(sync.is_shared('index.html'))
        for path in ('assets/desktop.js', 'assets/lagboken.js', 'src-tauri/src/lib.rs',
                     '.github/workflows/release.yml', 'scripts/stage.js',
                     'tests/browser/e2e.js', 'splash/splash-750x1334.png',
                     'scripts/sync_from_lagbok.py'):
            self.assertFalse(sync.is_shared(path), path)

    def test_independent_lines_merge_without_losing_desktop_edits(self):
        base = b'header\nshared\nfooter\n'
        desktop = b'header\nshared\nfooter\ndesktop-only\n'
        upstream = b'header\nupdated shared\nfooter\n'
        merged = sync.merge_text(desktop, base, upstream, 'assets/app.css')
        self.assertIn(b'updated shared', merged)
        self.assertIn(b'desktop-only', merged)

    def test_overlap_refuses_to_overwrite_desktop(self):
        base = b'header\nshared line\nfooter\n'
        desktop = b'header\ndesktop version\nfooter\n'
        upstream = b'header\nmobile version\nfooter\n'
        with self.assertRaisesRegex(ValueError, 'conflict'):
            sync.merge_text(desktop, base, upstream, 'index.html')

    def test_upstream_version_change_never_changes_desktop_version(self):
        base = b"(function(){\nconst APP_VERSION='1.6.4';\nconst x=1;\n})();\n"
        desktop = b"(function(){\nconst APP_VERSION='1.1.0';\nconst x=1;\n})();\n"
        upstream = b"(function(){\nconst APP_VERSION='1.6.5';\nconst x=2;\n})();\n"
        merged = sync.merge_text(desktop, base, upstream, 'assets/app.js')
        self.assertIn(b"const APP_VERSION='1.1.0';", merged)
        self.assertIn(b'const x=2', merged)
        self.assertNotIn(b'1.6.5', merged)

    def test_source_modules_added_before_desktop_module(self):
        base = b"const FILES=['core.js','app.js'];\nconsole.log(FILES);\n"
        upstream = b"const FILES=['core.js','new.js','app.js'];\nconsole.log(FILES);\n"
        desktop = b"const FILES=['core.js','app.js','desktop.js'];\nconsole.log(FILES);\n"
        merged = sync.sync_bundle(desktop, base, upstream)
        self.assertEqual(sync.bundle_files(merged), ['core.js', 'new.js', 'app.js', 'desktop.js'])

    def test_bundler_algorithm_changes_cannot_be_ignored(self):
        base = b"const FILES=['core.js','app.js'];\nconsole.log(FILES);\n"
        upstream = b"const FILES=['core.js','new.js','app.js'];\nconsole.log(FILES,true);\n"
        desktop = b"const FILES=['core.js','app.js','desktop.js'];\nconsole.log(FILES);\n"
        with self.assertRaisesRegex(ValueError, 'algorithm'):
            sync.sync_bundle(desktop, base, upstream)


if __name__ == '__main__':
    unittest.main()
