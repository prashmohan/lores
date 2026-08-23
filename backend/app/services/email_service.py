import html
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
    # Sanitize header fields against CRLF injection
    clean_to = "".join(c for c in to_email if c not in "\r\n").strip()
    clean_subject = "".join(c for c in subject if c not in "\r\n").strip()

    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info(
            "[DEV EMAIL NOT SENT (NO SMTP)] To: %s | Subject: %s\nText: %s",
            clean_to,
            clean_subject,
            text_content or html_content,
        )
        return False

    sender_name = "".join(c for c in (settings.EMAILS_FROM_NAME or "") if c not in "\r\n").strip()
    sender_email = "".join(c for c in (settings.EMAILS_FROM_EMAIL or "") if c not in "\r\n").strip()
    from_header = f"{sender_name} <{sender_email}>" if sender_name else sender_email

    msg = MIMEMultipart("alternative")
    msg["Subject"] = clean_subject
    msg["From"] = from_header
    msg["To"] = clean_to

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
        server.sendmail(sender_email, [clean_to], msg.as_string())
        server.quit()
        logger.info("Successfully sent email to %s (Subject: %s)", clean_to, clean_subject)
        return True
    except Exception as e:  # noqa: BLE001
        logger.error(
            "Failed to send email to %s via SMTP (%s): %s", clean_to, settings.SMTP_HOST, e
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
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 36px; border: 2px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
    .code-box {{ background-color: #fef3c7; border: 2px dashed #f59e0b; border-radius: 16px; padding: 20px; text-align: center; margin: 24px 0; }}
    .code {{ font-family: monospace; font-size: 38px; font-weight: 900; letter-spacing: 6px; color: #78350f; }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="width: 44px; height: 44px; background: #f59e0b; border-radius: 14px; text-align: center; vertical-align: middle;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#020617" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto;">
            <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2a1 1 0 0 1-.8-1.7L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17z"/>
            <path d="M12 22v-3"/>
          </svg>
        </td>
        <td style="padding-left: 14px; vertical-align: middle;">
          <div style="font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; line-height: 1;">Lores</div>
          <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-top: 4px;">Preserve your family history & oral stories</div>
        </td>
      </tr>
    </table>
    
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
    app_url = settings.APP_URL.rstrip("/")

    # Sanitize header strings against CRLF injection
    clean_inviter = "".join(c for c in inviter_name if c not in "\r\n").strip()
    clean_ws = "".join(c for c in workspace_name if c not in "\r\n").strip()
    subject = f"{clean_inviter} invited you to join the '{clean_ws}' Family Tree"

    # HTML-escape all variables rendered in HTML template
    safe_inviter = html.escape(clean_inviter)
    safe_ws = html.escape(clean_ws)
    safe_role = html.escape(role.capitalize())
    safe_to = html.escape(to_email.strip())
    safe_app_url = html.escape(app_url)

    text_body = f"""Hello,

{clean_inviter} has invited you to join the '{clean_ws}' family tree on Lores as a {role.capitalize()}.

Lores is an accessible family tree and oral history builder designed for recording stories and memories.

To access the family tree, open Lores in your browser:
{app_url}

Simply log in with your email ({to_email.strip()}) to view the family tree.

Warm regards,
Lores Family Tree
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }}
    .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 36px; border: 2px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }}
    .highlight {{ background-color: #f8fafc; border-radius: 14px; padding: 18px; margin: 20px 0; border: 1.5px solid #e2e8f0; }}
    .btn-container {{ text-align: center; margin: 28px 0 20px; }}
    .btn {{ display: inline-block; background-color: #f59e0b; color: #020617; font-weight: 800; font-size: 16px; padding: 14px 32px; text-decoration: none; border-radius: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }}
    .footer {{ font-size: 12px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="card">
    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
      <tr>
        <td style="width: 44px; height: 44px; background: #f59e0b; border-radius: 14px; text-align: center; vertical-align: middle;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#020617" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto;">
            <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2a1 1 0 0 1-.8-1.7L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17z"/>
            <path d="M12 22v-3"/>
          </svg>
        </td>
        <td style="padding-left: 14px; vertical-align: middle;">
          <div style="font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; line-height: 1;">Lores</div>
          <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-top: 4px;">Preserve your family history & oral stories</div>
        </td>
      </tr>
    </table>

    <p style="font-size: 16px; color: #1e293b; font-weight: 700;">You're invited!</p>
    <p style="font-size: 15px; color: #334155; line-height: 1.5;">
      <strong>{safe_inviter}</strong> has invited you to join <strong>{safe_ws}</strong> as a <strong>{safe_role}</strong>.
    </p>

    <div class="highlight">
      <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6;">
        <strong>Family Tree:</strong> {safe_ws}<br>
        <strong>Your Role:</strong> {safe_role}<br>
        <strong>Invited Email:</strong> {safe_to}
      </p>
    </div>

    <div class="btn-container">
      <a href="{safe_app_url}" class="btn" style="color: #020617; text-decoration: none;">Open Family Tree →</a>
    </div>

    <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 12px;">
      Or visit: <a href="{safe_app_url}" style="color: #d97706; text-decoration: underline;">{safe_app_url}</a>
    </p>

    <div class="footer">
      Sent with care by Lores Family Tree.
    </div>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, html_body, text_body)
