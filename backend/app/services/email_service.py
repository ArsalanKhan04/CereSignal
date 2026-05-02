"""
Email service for sending invitation emails to staff
"""

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_invitation_email(
    to_email: str,
    hospital_name: str,
    role: str,
    token: str,
) -> None:
    """Send a staff invitation email. Raises on failure — callers should catch and log."""
    # HashRouter requires /#/ prefix in the URL
    invite_url = f"{settings.FRONTEND_URL}/#/register/invite/{token}"
    role_display = role.capitalize()

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }}
        .container {{ max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px;
                      box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%); padding: 36px 40px; }}
        .header h1 {{ color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }}
        .header p {{ color: rgba(255,255,255,0.75); margin: 6px 0 0; font-size: 14px; }}
        .body {{ padding: 36px 40px; }}
        .body p {{ color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }}
        .role-badge {{ display: inline-block; background: #eff6ff; color: #2563eb;
                       border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 600;
                       margin-bottom: 24px; }}
        .btn {{ display: block; width: fit-content; margin: 28px auto 0;
                background: #2563eb; color: #ffffff; text-decoration: none;
                padding: 14px 36px; border-radius: 8px; font-size: 15px;
                font-weight: 700; text-align: center; letter-spacing: 0.01em; }}
        .note {{ color: #94a3b8; font-size: 13px; margin-top: 28px; }}
        .footer {{ background: #f1f5f9; padding: 20px 40px; }}
        .footer p {{ color: #94a3b8; font-size: 12px; margin: 0; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>CereSignal</h1>
          <p>Advanced EEG Analysis Platform</p>
        </div>
        <div class="body">
          <p>You have been invited to join <strong>{hospital_name}</strong> on CereSignal as a:</p>
          <span class="role-badge">{role_display}</span>
          <p>Click the button below to complete your registration. This invitation link expires in <strong>7 days</strong>.</p>
          <a href="{invite_url}" class="btn">Complete Registration</a>
          <p class="note">
            If the button does not work, copy and paste this link into your browser:<br />
            <a href="{invite_url}" style="color: #2563eb;">{invite_url}</a>
          </p>
        </div>
        <div class="footer">
          <p>If you were not expecting this invitation, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
    """

    if not settings.MAIL_FROM or not settings.MAIL_SERVER:
        logger.warning("Email not configured — skipping invite email send (MAIL_FROM or MAIL_SERVER not set)")
        return

    try:
        from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

        conf = ConnectionConfig(
            MAIL_USERNAME=settings.MAIL_USERNAME,
            MAIL_PASSWORD=settings.MAIL_PASSWORD,
            MAIL_FROM=settings.MAIL_FROM,
            MAIL_PORT=settings.MAIL_PORT,
            MAIL_SERVER=settings.MAIL_SERVER,
            MAIL_STARTTLS=settings.MAIL_STARTTLS,
            MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
            USE_CREDENTIALS=bool(settings.MAIL_USERNAME),
            VALIDATE_CERTS=True,
        )

        message = MessageSchema(
            subject=f"You've been invited to join {hospital_name} on CereSignal",
            recipients=[to_email],
            body=html_body,
            subtype=MessageType.html,
        )

        fm = FastMail(conf)
        await fm.send_message(message)
        logger.info(f"Invitation email sent to {to_email}")

    except ImportError:
        logger.warning("fastapi-mail not installed — skipping email send")
