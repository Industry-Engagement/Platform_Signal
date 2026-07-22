from __future__ import annotations

import unittest

from server import (
    ExclusiveThreadingHTTPServer,
    PLANE_MODEL,
    PROJECT_ROOT,
    SECTION_MUSIC,
    SUBWAY_MODEL,
    TrackerRequestHandler,
)


class PublicFileAllowlistTests(unittest.TestCase):
    def test_root_serves_integrated_interface(self) -> None:
        self.assertEqual(TrackerRequestHandler._public_file("/"), PROJECT_ROOT / "index.html")

    def test_public_assets_are_allowed(self) -> None:
        expected = PROJECT_ROOT / "assets" / "js" / "integrated-flight-tracker.js"
        self.assertEqual(
            TrackerRequestHandler._public_file("/assets/js/integrated-flight-tracker.js"),
            expected.resolve(),
        )
        self.assertEqual(TrackerRequestHandler._public_file("/assets/plane.glb"), PLANE_MODEL)
        self.assertEqual(TrackerRequestHandler._public_file("/assets/subway.glb"), SUBWAY_MODEL)
        self.assertEqual(TrackerRequestHandler._public_file("/assets/subway-centered.glb"), SUBWAY_MODEL)
        self.assertEqual(TrackerRequestHandler._public_file("/media/section-music.wav"), SECTION_MUSIC)

    def test_credentials_and_project_internals_are_blocked(self) -> None:
        blocked = [
            "/Flight_Data/credentials.json",
            "/Flight_Data/realtime-flight-tracker/backend.py",
            "/.git/config",
            "/start-website.bat",
            "/music/Clean Bandit - Rockabye (Lyrics) feat. Sean Paul & Anne-Marie.wav",
            "/media/other.wav",
            "/assets/../Flight_Data/credentials.json",
            "/assets/%2e%2e/Flight_Data/credentials.json",
        ]
        for path in blocked:
            with self.subTest(path=path):
                self.assertIsNone(TrackerRequestHandler._public_file(path))

    def test_single_byte_ranges_support_audio_streaming_and_seeking(self) -> None:
        parse = TrackerRequestHandler._parse_byte_range
        self.assertEqual(parse("bytes=0-99", 1000), (0, 99))
        self.assertEqual(parse("bytes=900-", 1000), (900, 999))
        self.assertEqual(parse("bytes=-100", 1000), (900, 999))
        self.assertEqual(parse("bytes=950-1200", 1000), (950, 999))
        for value in ("items=0-9", "bytes=1000-", "bytes=20-10", "bytes=0-1,4-5"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse(value, 1000)


class ExclusiveServerTests(unittest.TestCase):
    def test_second_server_cannot_bind_same_port(self) -> None:
        first = ExclusiveThreadingHTTPServer(("127.0.0.1", 0), TrackerRequestHandler)
        try:
            port = first.server_address[1]
            with self.assertRaises(OSError):
                duplicate = ExclusiveThreadingHTTPServer(("127.0.0.1", port), TrackerRequestHandler)
                duplicate.server_close()
        finally:
            first.server_close()


if __name__ == "__main__":
    unittest.main()
