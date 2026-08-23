from unittest.mock import MagicMock, patch

from app.services.email_service import send_email, send_invitation_email, send_otp_email


def test_send_email_fallback_when_no_smtp():
    with patch("app.services.email_service.settings") as mock_settings:
        mock_settings.SMTP_HOST = None
        mock_settings.SMTP_USER = None
        mock_settings.SMTP_PASSWORD = None
        mock_settings.EMAILS_FROM_EMAIL = "onboarding@resend.dev"
        mock_settings.EMAILS_FROM_NAME = "Lores"

        sent = send_email("test@example.com", "Test Subject", "<p>Hello</p>", "Hello")
        assert sent is False


def test_send_otp_email_via_smtp_success():
    with (
        patch("app.services.email_service.settings") as mock_settings,
        patch("smtplib.SMTP") as mock_smtp_cls,
    ):
        mock_settings.SMTP_HOST = "smtp.resend.com"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_USER = "resend"
        mock_settings.SMTP_PASSWORD = "mock-password"
        mock_settings.EMAILS_FROM_EMAIL = "onboarding@resend.dev"
        mock_settings.EMAILS_FROM_NAME = "Lores Family Tree"
        mock_settings.SMTP_TLS = True
        mock_settings.OTP_EXPIRE_MINUTES = 15

        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        sent = send_otp_email("relative@example.com", "849201")
        assert sent is True

        mock_smtp_cls.assert_called_once_with("smtp.resend.com", 587, timeout=10)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("resend", "mock-password")
        mock_server.sendmail.assert_called_once()
        mock_server.quit.assert_called_once()


def test_send_invitation_email_via_smtp_success():
    with (
        patch("app.services.email_service.settings") as mock_settings,
        patch("smtplib.SMTP") as mock_smtp_cls,
    ):
        mock_settings.SMTP_HOST = "smtp.resend.com"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_USER = "resend"
        mock_settings.SMTP_PASSWORD = "mock-password"
        mock_settings.EMAILS_FROM_EMAIL = "onboarding@resend.dev"
        mock_settings.EMAILS_FROM_NAME = "Lores Family Tree"
        mock_settings.APP_URL = "https://lores.example.com"
        mock_settings.SMTP_TLS = True

        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        sent = send_invitation_email(
            to_email="cousin@example.com",
            inviter_name="Arthur Miller",
            workspace_name="Miller Family Tree",
            role="collaborator",
        )
        assert sent is True
        mock_server.sendmail.assert_called_once()


def test_send_email_handles_smtp_exception_gracefully():
    with (
        patch("app.services.email_service.settings") as mock_settings,
        patch("smtplib.SMTP") as mock_smtp_cls,
    ):
        mock_settings.SMTP_HOST = "smtp.resend.com"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_USER = "resend"
        mock_settings.SMTP_PASSWORD = "mock-password"
        mock_settings.EMAILS_FROM_EMAIL = "onboarding@resend.dev"
        mock_settings.EMAILS_FROM_NAME = "Lores Family Tree"
        mock_settings.SMTP_TLS = True

        mock_smtp_cls.side_effect = Exception("SMTP connection timed out")

        sent = send_email("test@example.com", "Test", "<p>Test</p>")
        assert sent is False


def test_email_crlf_and_html_injection_sanitization():
    with (
        patch("app.services.email_service.settings") as mock_settings,
        patch("smtplib.SMTP") as mock_smtp_cls,
    ):
        mock_settings.SMTP_HOST = "smtp.resend.com"
        mock_settings.SMTP_PORT = 587
        mock_settings.SMTP_USER = "resend"
        mock_settings.SMTP_PASSWORD = "mock-password"
        mock_settings.EMAILS_FROM_EMAIL = "onboarding@resend.dev"
        mock_settings.EMAILS_FROM_NAME = "Lores Family Tree"
        mock_settings.APP_URL = "https://lores.example.com"
        mock_settings.SMTP_TLS = True

        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        # Attempt CRLF and HTML Injection in inputs
        malicious_inviter = "Attacker\r\nBcc: victim@example.com<script>alert(1)</script>"
        malicious_ws = "Evil Tree\r\nSubject: Overridden<a href='https://phish.com'>Click</a>"

        sent = send_invitation_email(
            to_email="cousin@example.com\r\n",
            inviter_name=malicious_inviter,
            workspace_name=malicious_ws,
            role="collaborator",
        )
        assert sent is True

        args, _kwargs = mock_server.sendmail.call_args
        _from_arg, to_arg, msg_arg = args
        assert "\r" not in to_arg[0]
        assert "\n" not in to_arg[0]

        # Verify subject header does not contain CRLF
        assert "\r\nBcc:" not in msg_arg
        assert "\r\nSubject: Overridden" not in msg_arg

        # Verify HTML body is properly escaped
        import email
        from email import policy

        parsed_msg = email.message_from_string(msg_arg, policy=policy.default)
        html_part = parsed_msg.get_body(preferencelist=("html",)).get_content()
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html_part
        assert "<script>alert(1)</script>" not in html_part
        assert "&lt;a href=" in html_part
        assert "<a href='https://phish.com'>" not in html_part
