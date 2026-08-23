import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger("lores.email")
settings = get_settings()


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str | None = None,
) -> bool:
    """Send an email using configured SMTP credentials or fallback to console logging."""
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(
            "[DEV EMAIL NOT SENT (NO SMTP)] To: %s | Subject: %s\nText: %s",
            to_email,
            subject,
            text_content or html_content,
        )
        return False

    sender_name = settings.EMAILS_FROM_NAME
    sender_email = settings.EMAILS_FROM_EMAIL
    from_header = f"{sender_name} <{sender_email}>" if sender_name else sender_email

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_header
    msg["To"] = to_email

    if text_content:
        msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        if settings.SMTP_PORT == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.SMTP_HOST, settings.SMTP_PORT, timeout=10
            )
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            if settings.SMTP_TLS:
                server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(sender_email, [to_email], msg.as_string())
        server.quit()
        logger.info("Successfully sent email to %s (Subject: %s)", to_email, subject)
        return True
    except Exception as e:  # noqa: BLE001
        logger.error(
            "Failed to send email to %s via SMTP (%s): %s", to_email, settings.SMTP_HOST, e
        )
        return False


def send_otp_email(to_email: str, otp_code: str) -> bool:
    """Send a passwordless 6-digit login verification OTP code."""
    subject = f"Your Lores sign-in code: {otp_code}"

    text_body = f"""Hello,

Your verification code to sign into Lores is:

{otp_code}

This code will expire in {settings.OTP_EXPIRE_MINUTES} minutes.

If you did not request this code, you can safely ignore this email.

Warm regards,
Lores Family Tree
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; padding: 32px; border: 2px solid #e2e8f0; }}
    .logo {{ font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 8px; }}
    .subtitle {{ font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 24px; }}
    .code-box {{ background-color: #fef3c7; border: 2px dashed #f59e0b; border-radius: 16px; padding: 18px; text-align: center; margin: 24px 0; }}
    .code {{ font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 6px; color: #78350f; }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🌳 Lores</div>
    <div class="subtitle">Accessible family tree & oral history builder</div>
    
    <p style="font-size: 16px; color: #1e293b; font-weight: 600;">Hello,</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.5;">Use the following 6-digit verification code to sign into your family tree account:</p>
    
    <div class="code-box">
      <div class="code">{otp_code}</div>
    </div>
    
    <p style="font-size: 13px; color: #64748b;">This code expires in <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>. If you did not request this email, no action is needed.</p>
    
    <div class="footer">
      Sent with care by Lores Family Tree.
    </div>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, html_body, text_body)


def send_invitation_email(
    to_email: str,
    inviter_name: str,
    workspace_name: str,
    role: str,
) -> bool:
    """Send an email invitation notifying a family member they were added to a workspace."""
    subject = f"{inviter_name} invited you to join the '{workspace_name}' Family Tree"

    text_body = f"""Hello,

{inviter_name} has invited you to join the '{workspace_name}' family tree on Lores as a {role.capitalize()}.

Lores is an accessible family tree and oral history builder designed for recording stories and memories.

To access the family tree, open Lores in your browser and log in with your email ({to_email}).

Warm regards,
Lores Family Tree
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; padding: 32px; border: 2px solid #e2e8f0; }}
    .logo {{ font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 8px; }}
    .subtitle {{ font-size: 14px; color: #64748b; font-weight: 600; margin-bottom: 24px; }}
    .highlight {{ background-color: #f1f5f9; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #cbd5e1; }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🌳 Lores</div>
    <div class="subtitle">Family Tree & Oral History Builder</div>
    
    <p style="font-size: 16px; color: #1e293b; font-weight: 700;">You're invited!</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.5;">
      <strong>{inviter_name}</strong> has invited you to join <strong>{workspace_name}</strong> as a <strong>{role.capitalize()}</strong>.
    </p>
    
    <div class="highlight">
      <p style="margin: 0; font-size: 14px; color: #334155;">
        <strong>Family Tree:</strong> {workspace_name}<br>
        <strong>Your Role:</strong> {role.capitalize()}<br>
        <strong>Invited Email:</strong> {to_email}
      </p>
    </div>
    
    <p style="font-size: 14px; color: #475569; line-height: 1.5;">
      To view the family tree and explore oral stories, simply open Lores in your browser and sign in using your email address.
    </p>
    
    <div class="footer">
      Sent with care by Lores Family Tree.
    </div>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, html_body, text_body)
