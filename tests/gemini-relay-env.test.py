import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "audit", Path(__file__).resolve().parents[1] / "scripts/audit-gemini-relay-env.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class GeminiRelayAuditTests(unittest.TestCase):
    def test_target_and_absent_are_distinct(self):
        result = audit.summarize(b"GEMINI_MODELS=gemini-3.1-pro-preview,gemini-3.8-flash\0GOOGLE_MODELS=gemini-3.1-pro-preview\0")
        self.assertIn("GEMINI_ENV_GEMINI_MODELS=PRESENT;TARGET_3_8=true", result)
        self.assertIn("GEMINI_ENV_GOOGLE_MODELS=PRESENT;TARGET_3_8=false", result)
        self.assertIn("GEMINI_ENV_ALLOWED_MODELS=ABSENT", result)
        self.assertIn("code_defaults_and_upstream_unverified", result)

    def test_never_print_values_or_secrets(self):
        result = audit.summarize(b"GEMINI_API_KEY=secret-key\0GEMINI_MODELS=token-that-looks-like-a-model\0GOOGLE_MODELS=invalid\nsecret\0ALLOWED_MODELS=x\0ALLOWED_MODELS=y\0")
        for secret in ("secret-key", "token-that-looks-like-a-model", "invalid\nsecret"):
            self.assertNotIn(secret, result)
        self.assertIn("UNRECOGNIZED_REDACTED", result)
        self.assertIn("DUPLICATE_REDACTED", result)


unittest.main()
