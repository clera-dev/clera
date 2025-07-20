#!/usr/bin/env python3

import os
import smtplib
import logging
from typing import Dict, Any, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from jinja2 import Environment, select_autoescape
from markupsafe import escape

logger = logging.getLogger("clera-email-service")

class EmailService:
    """
    Email service for sending account closure notifications using AWS SES SMTP.
    
    Configuration uses AWS SES SMTP settings for reliable email delivery.
    """
    
    def __init__(self):
        # AWS SES SMTP Configuration
        self.smtp_server = "email-smtp.us-west-2.amazonaws.com"
        self.smtp_port = 587
        self.smtp_username = os.getenv("AWS_SES_SMTP_USERNAME")
        self.smtp_password = os.getenv("AWS_SES_SMTP_PASSWORD")
        
        # From email configuration
        self.from_email = os.getenv("FROM_EMAIL", "noreply@askclera.com")
        self.from_name = os.getenv("FROM_NAME", "Clera")
        
        # Support contact information
        self.support_email = "support@askclera.com"
        
        # Validate required configuration
        if not self.smtp_username:
            logger.error("AWS_SES_SMTP_USERNAME environment variable not set")
        if not self.smtp_password:
            logger.error("AWS_SES_SMTP_PASSWORD environment variable not set")
        
        # Check if email service is properly configured
        if not self.smtp_username or not self.smtp_password:
            logger.warning("Email service not properly configured - emails will not be sent")
    
    def send_account_closure_notification(self, 
                                        user_email: str,
                                        user_name: str,
                                        account_id: str,
                                        confirmation_number: str,
                                        estimated_completion: str = "3-5 business days") -> bool:
        """
        Send account closure confirmation email to the user.
        
        Args:
            user_email: User's email address
            user_name: User's full name
            account_id: Account ID being closed
            confirmation_number: Unique confirmation number
            estimated_completion: Estimated completion timeline
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            subject = f"Account Closure Confirmation - {confirmation_number}"
            
            # Generate email content
            html_content = self._generate_closure_email_html(
                user_name=user_name,
                account_id=account_id,
                confirmation_number=confirmation_number,
                estimated_completion=estimated_completion
            )
            
            text_content = self._generate_closure_email_text(
                user_name=user_name,
                account_id=account_id,
                confirmation_number=confirmation_number,
                estimated_completion=estimated_completion
            )
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content
            )
            
        except Exception as e:
            logger.error(f"Error sending account closure notification to {user_email}: {e}")
            return False
    
    def send_account_closure_complete_notification(self,
                                                 user_email: str,
                                                 user_name: str,
                                                 account_id: str,
                                                 confirmation_number: str,
                                                 final_transfer_amount: float = 0.0) -> bool:
        """
        Send final account closure completion email.
        
        Args:
            user_email: User's email address
            user_name: User's full name
            account_id: Account ID that was closed
            confirmation_number: Original confirmation number
            final_transfer_amount: Final amount transferred to bank
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            subject = f"Account Closure Complete - {confirmation_number}"
            
            html_content = self._generate_closure_complete_email_html(
                user_name=user_name,
                account_id=account_id,
                confirmation_number=confirmation_number,
                final_transfer_amount=final_transfer_amount
            )
            
            text_content = self._generate_closure_complete_email_text(
                user_name=user_name,
                account_id=account_id,
                confirmation_number=confirmation_number,
                final_transfer_amount=final_transfer_amount
            )
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content
            )
            
        except Exception as e:
            logger.error(f"Error sending account closure completion notification to {user_email}: {e}")
            return False
    
    def _send_email(self, to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        """
        Send email using AWS SES SMTP.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email content
            text_content: Plain text email content
            
        Returns:
            True if email sent successfully, False otherwise
        """
        # Validate credentials before attempting to send
        if not self.smtp_username or not self.smtp_password:
            logger.error(f"Cannot send email to {to_email}: AWS SES credentials not configured")
            return False
            
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Add both plain text and HTML versions
            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            
            msg.attach(part1)
            msg.attach(part2)
            
            # Connect to AWS SES SMTP server
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.smtp_username, self.smtp_password)
            
            # Send email
            text = msg.as_string()
            server.sendmail(self.from_email, to_email, text)
            server.quit()
            
            logger.info(f"Account closure email sent successfully to (redacted email)")
            return True
            
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email to (redacted email): {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email to (redacted email): {e}")
            return False
    
    def _generate_closure_email_html(self, user_name: str, account_id: str, 
                                   confirmation_number: str, estimated_completion: str) -> str:
        """Generate HTML email content for account closure notification."""
        
        # Escape user-supplied values to prevent XSS
        user_name_escaped = escape(user_name)
        account_id_escaped = escape(account_id)
        confirmation_number_escaped = escape(confirmation_number)
        estimated_completion_escaped = escape(estimated_completion)
        
        env = Environment(autoescape=select_autoescape(['html', 'xml']))
        template = env.from_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Closure Confirmation</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
        .confirmation-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #e0e0e0; }
        .details-table td:first-child { font-weight: bold; color: #666; width: 40%; }
        .timeline { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .timeline h3 { margin-top: 0; color: #1565c0; }
        .timeline ul { margin: 10px 0; padding-left: 20px; }
        .timeline li { margin: 8px 0; }
        .warning { background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0; }
        .contact-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { background: #f1f1f1; padding: 20px; text-align: center; color: #666; font-size: 12px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .confirmation-number { font-family: monospace; background: #e9ecef; padding: 8px 12px; border-radius: 4px; font-size: 16px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <div style="margin-bottom: 20px;">
            <img src="https://askclera.com/clera-logo.png" alt="Clera" style="height: 40px; width: auto;" />
        </div>
        <h1>Account Closure Confirmation</h1>
        <p>Your request has been successfully submitted</p>
    </div>
    
    <div class="content">
        <h2>Dear {{ user_name }},</h2>
        
        <p>We have received and processed your account closure request. Your account closure process has been initiated and is now in progress.</p>
        
        <div class="confirmation-box">
            <h3>Confirmation Details</h3>
            <table class="details-table">
                <tr>
                    <td>Confirmation Number:</td>
                    <td><span class="confirmation-number">{{ confirmation_number }}</span></td>
                </tr>
                <tr>
                    <td>Account ID:</td>
                    <td>{{ account_id }}</td>
                </tr>
                <tr>
                    <td>Request Date:</td>
                    <td>{{ request_date }}</td>
                </tr>
                <tr>
                    <td>Estimated Completion:</td>
                    <td>{{ estimated_completion }}</td>
                </tr>
            </table>
        </div>
        
        <div class="timeline">
            <h3>What Happens Next</h3>
            <ul>
                <li><strong>Holdings Liquidation:</strong> All your investments will be sold at current market prices</li>
                <li><strong>Fund Transfer:</strong> Resulting cash will be transferred to your connected bank account</li>
                <li><strong>Account Closure:</strong> Your account will be permanently closed once all transfers complete</li>
                <li><strong>Final Documentation:</strong> You will receive final account statements and tax documents</li>
            </ul>
            <p><strong>Timeline:</strong> Please allow {{ estimated_completion }} for this process to complete.</p>
        </div>
        
        <div class="warning">
            <h4>⚠️ Important Notice</h4>
            <p><strong>This process cannot be reversed once liquidation begins.</strong> Your account closure is now in progress and cannot be canceled.</p>
        </div>
        
        <div class="contact-info">
            <h3>Questions or Concerns?</h3>
            <p>Our support team is available to help you during this process:</p>
            <p>
                <strong>Email:</strong> <a href="mailto:{{ support_email }}">{{ support_email }}</a>
            </p>
            <p>Please reference your confirmation number <strong>{{ confirmation_number }}</strong> when contacting support.</p>
        </div>
        
        <p>Thank you for choosing Clera. We're here to help if you need anything during this transition.</p>
        
        <p>Best regards,<br>
        <strong>The Clera Team</strong></p>
    </div>
    
    <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>© {{ current_year }} Clera. All rights reserved.</p>
    </div>
</body>
</html>
        """)
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            estimated_completion=estimated_completion_escaped,
            request_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            support_email=self.support_email,
            current_year=datetime.now().year
        )
    
    def _generate_closure_email_text(self, user_name: str, account_id: str,
                                   confirmation_number: str, estimated_completion: str) -> str:
        """Generate plain text email content for account closure notification."""
        
        # Escape user-supplied values for consistency (less critical for text templates)
        user_name_escaped = escape(user_name)
        account_id_escaped = escape(account_id)
        confirmation_number_escaped = escape(confirmation_number)
        estimated_completion_escaped = escape(estimated_completion)
        
        env = Environment(autoescape=select_autoescape(['html', 'xml']))
        template = env.from_string("""
ACCOUNT CLOSURE CONFIRMATION
{{ confirmation_number }}

Dear {{ user_name }},

We have received and processed your account closure request. Your account closure process has been initiated and is now in progress.

CONFIRMATION DETAILS:
- Confirmation Number: {{ confirmation_number }}
- Account ID: {{ account_id }}
- Request Date: {{ request_date }}
- Estimated Completion: {{ estimated_completion }}

WHAT HAPPENS NEXT:
1. Holdings Liquidation: All your investments will be sold at current market prices
2. Fund Transfer: Resulting cash will be transferred to your connected bank account
3. Account Closure: Your account will be permanently closed once all transfers complete
4. Final Documentation: You will receive final account statements and tax documents

Timeline: Please allow {{ estimated_completion }} for this process to complete.

⚠️ IMPORTANT NOTICE:
This process cannot be reversed once liquidation begins. Your account closure is now in progress and cannot be canceled.

QUESTIONS OR CONCERNS?
Our support team is available to help you during this process:
- Email: {{ support_email }}

Please reference your confirmation number {{ confirmation_number }} when contacting support.

Thank you for choosing Clera. We're here to help if you need anything during this transition.

Best regards,
The Clera Team

---
This is an automated message. Please do not reply to this email.
© {{ current_year }} Clera. All rights reserved.
        """)
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            estimated_completion=estimated_completion_escaped,
            request_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            support_email=self.support_email,
            current_year=datetime.now().year
        )
    
    def _generate_closure_complete_email_html(self, user_name: str, account_id: str,
                                            confirmation_number: str, final_transfer_amount: float) -> str:
        """Generate HTML email content for account closure completion notification."""
        
        # Escape user-supplied values to prevent XSS
        user_name_escaped = escape(user_name)
        account_id_escaped = escape(account_id)
        confirmation_number_escaped = escape(confirmation_number)
        
        env = Environment(autoescape=select_autoescape(['html', 'xml']))
        template = env.from_string("""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Closure Complete</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
        .completion-box { background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #e0e0e0; }
        .details-table td:first-child { font-weight: bold; color: #666; width: 40%; }
        .contact-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { background: #f1f1f1; padding: 20px; text-align: center; color: #666; font-size: 12px; border-radius: 0 0 8px 8px; }
        .confirmation-number { font-family: monospace; background: #e9ecef; padding: 8px 12px; border-radius: 4px; font-size: 16px; font-weight: bold; }
        .amount { color: #28a745; font-weight: bold; font-size: 18px; }
    </style>
</head>
<body>
    <div class="header">
        <div style="margin-bottom: 20px;">
            <img src="https://askclera.com/clera-logo.png" alt="Clera" style="height: 40px; width: auto;" />
        </div>
        <h1>✅ Account Closure Complete</h1>
        <p>Your account has been successfully closed</p>
    </div>
    
    <div class="content">
        <h2>Dear {{ user_name }},</h2>
        
        <p>Your account closure process has been completed successfully. This email serves as your final confirmation that your investment account has been permanently closed.</p>
        
        <div class="completion-box">
            <h3>Final Closure Details</h3>
            <table class="details-table">
                <tr>
                    <td>Confirmation Number:</td>
                    <td><span class="confirmation-number">{{ confirmation_number }}</span></td>
                </tr>
                <tr>
                    <td>Account ID:</td>
                    <td>{{ account_id }}</td>
                </tr>
                <tr>
                    <td>Closure Date:</td>
                    <td>{{ closure_date }}</td>
                </tr>
                {% if final_transfer_amount > 0 %}
                <tr>
                    <td>Final Transfer Amount:</td>
                    <td><span class="amount">${{ "%.2f"|format(final_transfer_amount) }}</span></td>
                </tr>
                {% endif %}
            </table>
        </div>
        
        <h3>What Has Been Completed:</h3>
        <ul>
            <li>✅ All holdings have been liquidated</li>
            <li>✅ All funds have been transferred to your bank account</li>
            <li>✅ Your investment account has been permanently closed</li>
            <li>✅ Final documentation is being prepared</li>
        </ul>
        
        <div class="contact-info">
            <h3>Important Information</h3>
            <p><strong>Account Status:</strong> CLOSED - Your account number is no longer valid</p>
            <p><strong>Tax Documents:</strong> You will receive your final tax documents (1099) by January 31st for the current tax year</p>
            <p><strong>Record Keeping:</strong> Please save this email and your confirmation number for your records</p>
        </div>
        
        <div class="contact-info">
            <h3>Questions?</h3>
            <p>If you have any questions about your account closure or need assistance, please contact us:</p>
            <p>
                <strong>Email:</strong> <a href="mailto:{{ support_email }}">{{ support_email }}</a>
            </p>
            <p>Please reference your confirmation number <strong>{{ confirmation_number }}</strong> when contacting support.</p>
        </div>
        
        <p>Thank you for choosing Clera. We appreciate the trust you placed in us.</p>
        
        <p>Best regards,<br>
        <strong>The Clera Team</strong></p>
    </div>
    
    <div class="footer">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>© {{ current_year }} Clera. All rights reserved.</p>
    </div>
</body>
</html>
        """)
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            final_transfer_amount=final_transfer_amount,
            closure_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            support_email=self.support_email,
            current_year=datetime.now().year
        )
    
    def _generate_closure_complete_email_text(self, user_name: str, account_id: str,
                                            confirmation_number: str, final_transfer_amount: float) -> str:
        """Generate plain text email content for account closure completion notification."""
        
        # Escape user-supplied values for consistency (less critical for text templates)
        user_name_escaped = escape(user_name)
        account_id_escaped = escape(account_id)
        confirmation_number_escaped = escape(confirmation_number)
        
        env = Environment(autoescape=select_autoescape(['html', 'xml']))
        template = env.from_string("""
ACCOUNT CLOSURE COMPLETE
{{ confirmation_number }}

Dear {{ user_name }},

Your account closure process has been completed successfully. This email serves as your final confirmation that your investment account has been permanently closed.

FINAL CLOSURE DETAILS:
- Confirmation Number: {{ confirmation_number }}
- Account ID: {{ account_id }}
- Closure Date: {{ closure_date }}
{% if final_transfer_amount > 0 %}- Final Transfer Amount: ${{ "%.2f"|format(final_transfer_amount) }}{% endif %}

WHAT HAS BEEN COMPLETED:
✅ All holdings have been liquidated
✅ All funds have been transferred to your bank account
✅ Your investment account has been permanently closed
✅ Final documentation is being prepared

IMPORTANT INFORMATION:
- Account Status: CLOSED - Your account number is no longer valid
- Tax Documents: You will receive your final tax documents (1099) by January 31st for the current tax year
- Record Keeping: Please save this email and your confirmation number for your records

QUESTIONS?
If you have any questions about your account closure or need assistance, please contact us:
- Email: {{ support_email }}

Please reference your confirmation number {{ confirmation_number }} when contacting support.

Thank you for choosing Clera. We appreciate the trust you placed in us.

Best regards,
The Clera Team

---
This is an automated message. Please do not reply to this email.
© {{ current_year }} Clera. All rights reserved.
        """)
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            final_transfer_amount=final_transfer_amount,
            closure_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            support_email=self.support_email,
            current_year=datetime.now().year
        )

# Convenience function for easy import
def send_account_closure_email(user_email: str, user_name: str, account_id: str, 
                             confirmation_number: str, estimated_completion: str = "3-5 business days") -> bool:
    """
    Send account closure confirmation email.
    
    Args:
        user_email: User's email address
        user_name: User's full name
        account_id: Account ID being closed
        confirmation_number: Unique confirmation number
        estimated_completion: Estimated completion timeline
        
    Returns:
        True if email sent successfully, False otherwise
    """
    email_service = EmailService()
    return email_service.send_account_closure_notification(
        user_email=user_email,
        user_name=user_name,
        account_id=account_id,
        confirmation_number=confirmation_number,
        estimated_completion=estimated_completion
    )

def send_account_closure_complete_email(user_email: str, user_name: str, account_id: str,
                                      confirmation_number: str, final_transfer_amount: float = 0.0) -> bool:
    """
    Send account closure completion email.
    
    Args:
        user_email: User's email address
        user_name: User's full name
        account_id: Account ID that was closed
        confirmation_number: Original confirmation number
        final_transfer_amount: Final amount transferred to bank
        
    Returns:
        True if email sent successfully, False otherwise
    """
    email_service = EmailService()
    return email_service.send_account_closure_complete_notification(
        user_email=user_email,
        user_name=user_name,
        account_id=account_id,
        confirmation_number=confirmation_number,
        final_transfer_amount=final_transfer_amount
    ) 