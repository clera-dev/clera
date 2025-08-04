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
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #ffffff; 
            background-color: #000000; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .email-container { 
            background-color: #000000; 
            border-radius: 12px; 
            overflow: hidden;
            box-shadow: 0 0 30px rgba(6, 182, 212, 0.2);
        }
        .header { 
            background: linear-gradient(135deg, #000000 0%, #0f172a 100%); 
            color: #ffffff; 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(6, 182, 212, 0.1) 50%, transparent 70%);
            pointer-events: none;
        }
        .header h1 { 
            margin: 0; 
            font-size: 32px; 
            font-weight: 600;
            background: linear-gradient(135deg, #06b6d4, #0ea5e9, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
        }
        .logo { 
            width: 48px; 
            height: 48px; 
            background: linear-gradient(135deg, #06b6d4, #3b82f6); 
            border-radius: 12px; 
            margin: 0 auto 20px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.4);
        }
        .logo::after {
            content: 'C';
            color: #000000;
            font-weight: bold;
            font-size: 24px;
        }
        .content { 
            background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); 
            padding: 40px 30px; 
            border-left: 2px solid #06b6d4;
        }
        .confirmation-box { 
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(59, 130, 246, 0.1)); 
            padding: 25px; 
            border-radius: 12px; 
            margin: 25px 0; 
            border: 1px solid rgba(6, 182, 212, 0.3);
            box-shadow: 0 0 15px rgba(6, 182, 212, 0.1);
        }
        .details-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
        }
        .details-table td { 
            padding: 15px 12px; 
            border-bottom: 1px solid rgba(6, 182, 212, 0.2); 
        }
        .details-table td:first-child { 
            font-weight: 600; 
            color: #06b6d4; 
            width: 40%; 
        }
        .timeline { 
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(59, 130, 246, 0.05)); 
            padding: 25px; 
            border-radius: 12px; 
            margin: 25px 0; 
            border: 1px solid rgba(6, 182, 212, 0.2);
        }
        .timeline h3 { 
            margin-top: 0; 
            color: #06b6d4; 
            font-size: 20px;
            text-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
        }
        .timeline ul { 
            margin: 15px 0; 
            padding-left: 20px; 
        }
        .timeline li { 
            margin: 12px 0; 
            color: #e2e8f0;
        }
        .warning { 
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 146, 60, 0.1)); 
            padding: 20px; 
            border-radius: 12px; 
            border: 1px solid rgba(245, 158, 11, 0.3); 
            margin: 25px 0; 
        }
        .warning h4 {
            color: #f59e0b;
            margin-top: 0;
        }
        .contact-info { 
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(30, 41, 59, 0.8)); 
            padding: 25px; 
            border-radius: 12px; 
            margin: 25px 0; 
            border: 1px solid rgba(6, 182, 212, 0.2);
        }
        .contact-info h3 {
            color: #06b6d4;
            margin-top: 0;
        }
        .footer { 
            background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); 
            padding: 30px 20px; 
            text-align: center; 
            color: #64748b; 
            font-size: 14px; 
            border-top: 1px solid rgba(6, 182, 212, 0.2);
        }
        .confirmation-number { 
            font-family: 'Courier New', monospace; 
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2)); 
            padding: 12px 16px; 
            border-radius: 8px; 
            font-size: 18px; 
            font-weight: bold; 
            color: #06b6d4;
            text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
            border: 1px solid rgba(6, 182, 212, 0.3);
        }
        .glow-text {
            color: #06b6d4;
            text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
        }
        a {
            color: #06b6d4;
            text-decoration: none;
        }
        a:hover {
            text-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo"></div>
            <h1>Account Closure Confirmation</h1>
            <p style="color: #64748b; font-size: 16px; margin: 10px 0 0 0;">Your request has been successfully submitted</p>
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
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #ffffff; 
            background-color: #000000; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .email-container { 
            background-color: #000000; 
            border-radius: 12px; 
            overflow: hidden;
            box-shadow: 0 0 40px rgba(6, 182, 212, 0.3);
        }
        .header { 
            background: linear-gradient(135deg, #000000 0%, #0f172a 100%); 
            color: #ffffff; 
            padding: 40px 20px; 
            text-align: center; 
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent 30%, rgba(34, 197, 94, 0.1) 50%, transparent 70%);
            pointer-events: none;
        }
        .header h1 { 
            margin: 0; 
            font-size: 36px; 
            font-weight: 700;
            background: linear-gradient(135deg, #22c55e, #06b6d4, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-shadow: 0 0 25px rgba(34, 197, 94, 0.6);
        }
        .logo { 
            width: 48px; 
            height: 48px; 
            background: linear-gradient(135deg, #22c55e, #06b6d4); 
            border-radius: 12px; 
            margin: 0 auto 20px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            box-shadow: 0 0 25px rgba(34, 197, 94, 0.5);
        }
        .logo::after {
            content: 'C';
            color: #000000;
            font-weight: bold;
            font-size: 24px;
        }
        .content { 
            background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%); 
            padding: 40px 30px; 
            border-left: 2px solid #22c55e;
        }
        .completion-box { 
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(6, 182, 212, 0.1)); 
            padding: 25px; 
            border-radius: 12px; 
            margin: 25px 0; 
            border: 1px solid rgba(34, 197, 94, 0.4);
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
        }
        .details-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
        }
        .details-table td { 
            padding: 15px 12px; 
            border-bottom: 1px solid rgba(34, 197, 94, 0.2); 
        }
        .details-table td:first-child { 
            font-weight: 600; 
            color: #22c55e; 
            width: 40%; 
        }
        .contact-info { 
            background: linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(30, 41, 59, 0.8)); 
            padding: 25px; 
            border-radius: 12px; 
            margin: 25px 0; 
            border: 1px solid rgba(6, 182, 212, 0.2);
        }
        .contact-info h3 {
            color: #06b6d4;
            margin-top: 0;
            text-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
        }
        .footer { 
            background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); 
            padding: 30px 20px; 
            text-align: center; 
            color: #64748b; 
            font-size: 14px; 
            border-top: 1px solid rgba(34, 197, 94, 0.2);
        }
        .confirmation-number { 
            font-family: 'Courier New', monospace; 
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(6, 182, 212, 0.2)); 
            padding: 12px 16px; 
            border-radius: 8px; 
            font-size: 18px; 
            font-weight: bold; 
            color: #22c55e;
            text-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .amount { 
            color: #22c55e; 
            font-weight: bold; 
            font-size: 20px;
            text-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
        }
        .success-checkmark {
            color: #22c55e;
            font-size: 24px;
            text-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
        }
        ul li {
            color: #e2e8f0;
            margin: 12px 0;
        }
        a {
            color: #06b6d4;
            text-decoration: none;
        }
        a:hover {
            text-shadow: 0 0 8px rgba(6, 182, 212, 0.8);
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo"></div>
            <h1><span class="success-checkmark">✅</span> Account Closure Complete</h1>
            <p style="color: #64748b; font-size: 16px; margin: 10px 0 0 0;">Your account has been successfully closed</p>
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