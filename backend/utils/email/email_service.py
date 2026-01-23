#!/usr/bin/env python3

import os
import smtplib
import re
import logging
from typing import Dict, Any, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from jinja2 import Environment, select_autoescape, FileSystemLoader
from markupsafe import escape

logger = logging.getLogger("clera-email-service")

class EmailService:
    """
    Email service for sending account closure notifications using AWS SES SMTP.
    
    Configuration uses AWS SES SMTP settings for reliable email delivery.
    """
    
    def __init__(self):
        # AWS SES SMTP Configuration (us-west-1 region)
        self.smtp_server = "email-smtp.us-west-1.amazonaws.com"
        self.smtp_port = 587
        self.smtp_username = os.getenv("AWS_SES_SMTP_USERNAME")
        self.smtp_password = os.getenv("AWS_SES_SMTP_PASSWORD")
        
        # From email configuration
        self.from_email = os.getenv("FROM_EMAIL", "noreply@askclera.com")
        self.from_name = os.getenv("FROM_NAME", "Clera")
        
        # Support contact information
        self.support_email = "support@askclera.com"
        
        # Template configuration
        self.template_dir = os.path.join(os.path.dirname(__file__), "templates")
        self.env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=select_autoescape(['html', 'xml'])
        )
        
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
            
            # Path to the transparent logo
            logo_path = os.path.join(self.template_dir, "clera-logo-transparent-200.png")
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                inline_images={'clera_logo': logo_path}
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
            
            # Path to the transparent logo
            logo_path = os.path.join(self.template_dir, "clera-logo-transparent-200.png")
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                inline_images={'clera_logo': logo_path}
            )
            
        except Exception as e:
            logger.error(f"Error sending account closure completion notification to {user_email}: {e}")
            return False

    def send_welcome_email(
        self,
        user_email: str,
        user_name: Optional[str] = None
    ) -> bool:
        """
        Send welcome email to new users upon signup.
        
        Args:
            user_email: User's email address
            user_name: User's name (optional)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            subject = "Welcome to Clera - Your AI Investment Companion"
            
            html_content = self._generate_welcome_email_html(user_name=user_name)
            text_content = self._generate_welcome_email_text(user_name=user_name)
            
            # Path to the transparent logo
            logo_path = os.path.join(self.template_dir, "clera-logo-transparent-200.png")
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                inline_images={'clera_logo': logo_path}
            )
        except Exception as e:
            logger.error(f"Error sending welcome email to {user_email}: {e}")
            return False

    def send_order_cancellation_notification(
        self,
        user_email: str,
        symbol: str,
        action: str,
        cancellation_reason: str,
        queued_at: Optional[str] = None,
        current_price: Optional[float] = None,
        price_at_creation: Optional[float] = None,
        limit_price: Optional[float] = None
    ) -> bool:
        """
        Send a queued order cancellation email.
        
        Args:
            user_email: User's email address
            symbol: Ticker symbol
            action: BUY or SELL
            cancellation_reason: Reason code for cancellation
            queued_at: ISO timestamp when order was queued
            current_price: Current market price at cancellation
            price_at_creation: Last price when order was queued
            limit_price: Protective limit price used for queueing
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            safe_symbol = re.sub(r'[\r\n]+', '', symbol or '').strip() or 'your'
            subject = f"Your {safe_symbol} order was cancelled"
            
            html_content = self._generate_order_cancelled_email_html(
                symbol=symbol,
                action=action,
                cancellation_reason=cancellation_reason,
                queued_at=queued_at,
                current_price=current_price,
                price_at_creation=price_at_creation,
                limit_price=limit_price
            )
            
            text_content = self._generate_order_cancelled_email_text(
                symbol=symbol,
                action=action,
                cancellation_reason=cancellation_reason,
                queued_at=queued_at,
                current_price=current_price,
                price_at_creation=price_at_creation,
                limit_price=limit_price
            )
            
            # Path to the transparent logo
            logo_path = os.path.join(self.template_dir, "clera-logo-transparent-200.png")
            
            return self._send_email(
                to_email=user_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                inline_images={'clera_logo': logo_path}
            )
        except Exception as e:
            logger.error(f"Error sending order cancellation notification to {user_email}: {e}")
            return False
    
    def _send_email(self, to_email: str, subject: str, html_content: str, text_content: str, inline_images: Optional[Dict[str, str]] = None) -> bool:
        """
        Send email using AWS SES SMTP.
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML email content
            text_content: Plain text email content
            inline_images: Optional dictionary mapping Content-ID to file path for inline images
            
        Returns:
            True if email sent successfully, False otherwise
        """
        # Validate credentials before attempting to send
        if not self.smtp_username or not self.smtp_password:
            logger.error(f"Cannot send email to {to_email}: AWS SES credentials not configured")
            return False
            
        try:
            # Create message container
            # Use 'related' if we have inline images, otherwise 'alternative' is fine but 'related' handles both
            if inline_images:
                msg = MIMEMultipart('related')
            else:
                msg = MIMEMultipart('alternative')
                
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # If we have images, we need to encapsulate the text/html part in an 'alternative' container
            if inline_images:
                msg_alternative = MIMEMultipart('alternative')
                msg.attach(msg_alternative)
            else:
                msg_alternative = msg
            
            # Add both plain text and HTML versions
            part1 = MIMEText(text_content, 'plain')
            part2 = MIMEText(html_content, 'html')
            
            msg_alternative.attach(part1)
            msg_alternative.attach(part2)
            
            # Attach inline images
            if inline_images:
                for cid, path in inline_images.items():
                    if os.path.exists(path):
                        with open(path, 'rb') as f:
                            img_data = f.read()
                            img = MIMEImage(img_data)
                            # Define the image ID
                            img.add_header('Content-ID', f'<{cid}>')
                            # Default disposition is inline
                            img.add_header('Content-Disposition', 'inline', filename=os.path.basename(path))
                            msg.attach(img)
                    else:
                        logger.warning(f"Inline image not found at path: {path}")
            
            # Connect to AWS SES SMTP server
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.smtp_username, self.smtp_password)
            
            # Send email
            text = msg.as_string()
            server.sendmail(self.from_email, to_email, text)
            server.quit()
            
            logger.info(f"Email sent successfully to (redacted email)")
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
        
        template = self.env.get_template("account_closure_notification.html")
        
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
        
        template = self.env.get_template("account_closure_notification.txt")
        
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
        
        template = self.env.get_template("account_closure_complete.html")
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            final_transfer_amount=final_transfer_amount,
            completion_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
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
        
        template = self.env.get_template("account_closure_complete.txt")
        
        return template.render(
            user_name=user_name_escaped,
            account_id=account_id_escaped,
            confirmation_number=confirmation_number_escaped,
            final_transfer_amount=final_transfer_amount,
            completion_date=datetime.now().strftime("%B %d, %Y at %I:%M %p"),
            support_email=self.support_email,
            current_year=datetime.now().year
        )

    def _generate_order_cancelled_email_html(
        self,
        symbol: str,
        action: str,
        cancellation_reason: str,
        queued_at: Optional[str],
        current_price: Optional[float],
        price_at_creation: Optional[float],
        limit_price: Optional[float]
    ) -> str:
        """Generate HTML email content for queued order cancellation."""
        template = self.env.get_template("order_cancelled_notification.html")
        
        return template.render(
            symbol=escape(symbol),
            action=escape(action),
            cancellation_reason=escape(cancellation_reason),
            queued_at=escape(queued_at) if queued_at else None,
            current_price=current_price,
            price_at_creation=price_at_creation,
            limit_price=limit_price,
            support_email=self.support_email,
            current_year=datetime.now().year
        )
    
    def _generate_order_cancelled_email_text(
        self,
        symbol: str,
        action: str,
        cancellation_reason: str,
        queued_at: Optional[str],
        current_price: Optional[float],
        price_at_creation: Optional[float],
        limit_price: Optional[float]
    ) -> str:
        """Generate plain text email content for queued order cancellation."""
        template = self.env.get_template("order_cancelled_notification.txt")
        
        return template.render(
            symbol=escape(symbol),
            action=escape(action),
            cancellation_reason=escape(cancellation_reason),
            queued_at=escape(queued_at) if queued_at else None,
            current_price=current_price,
            price_at_creation=price_at_creation,
            limit_price=limit_price,
            support_email=self.support_email,
            current_year=datetime.now().year
        )

    def _generate_welcome_email_html(self, user_name: Optional[str] = None) -> str:
        """Generate HTML email content for welcome email."""
        template = self.env.get_template("welcome.html")
        
        return template.render(
            user_name=escape(user_name) if user_name else None,
            app_url="https://app.askclera.com",
            support_email=self.support_email,
            current_year=datetime.now().year
        )
    
    def _generate_welcome_email_text(self, user_name: Optional[str] = None) -> str:
        """Generate plain text email content for welcome email."""
        template = self.env.get_template("welcome.txt")
        
        return template.render(
            user_name=escape(user_name) if user_name else None,
            app_url="https://app.askclera.com",
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


def send_welcome_email(user_email: str, user_name: Optional[str] = None) -> bool:
    """
    Send welcome email to new users.
    
    Args:
        user_email: User's email address
        user_name: User's name (optional)
        
    Returns:
        True if email sent successfully, False otherwise
    """
    email_service = EmailService()
    return email_service.send_welcome_email(
        user_email=user_email,
        user_name=user_name
    )