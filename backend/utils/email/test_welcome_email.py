#!/usr/bin/env python3
"""
Welcome Email Test Script

This script allows you to test the welcome email by sending it to your personal email address.
It uses the same EmailService logic that would be used in production.

Usage:
    # From the backend directory, activate your virtual environment first:
    source venv/bin/activate
    
    # Run the test script with your email:
    python -m utils.email.test_welcome_email your_email@example.com
    
    # Or with a custom name:
    python -m utils.email.test_welcome_email your_email@example.com "John Smith"
    
    # To preview the HTML without sending (saves to file):
    python -m utils.email.test_welcome_email --preview
    
Requirements:
    - AWS_SES_SMTP_USERNAME and AWS_SES_SMTP_PASSWORD must be set in your .env file
    - The FROM_EMAIL must be verified in AWS SES

Examples:
    python -m utils.email.test_welcome_email john@example.com
    python -m utils.email.test_welcome_email john@example.com "John"
    python -m utils.email.test_welcome_email --preview
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend/.env
backend_dir = Path(__file__).parent.parent.parent
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded environment from: {env_path}")
else:
    print(f"⚠️  No .env file found at: {env_path}")

from utils.email.email_service import EmailService, send_welcome_email


def preview_email(output_dir: str = "email_previews"):
    """Generate HTML preview of the welcome email without sending."""
    
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    email_service = EmailService()
    
    print("\n🎨 Generating Welcome Email Previews...")
    print("=" * 60)
    
    # Generate with name
    try:
        html_with_name = email_service._generate_welcome_email_html(user_name="Alex")
        html_file = os.path.join(output_dir, "welcome_email_preview.html")
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_with_name)
        print(f"✅ HTML preview (with name) saved to: {html_file}")
    except Exception as e:
        print(f"❌ Error generating HTML preview: {e}")
    
    # Generate without name
    try:
        html_no_name = email_service._generate_welcome_email_html(user_name=None)
        html_file_no_name = os.path.join(output_dir, "welcome_email_preview_no_name.html")
        with open(html_file_no_name, 'w', encoding='utf-8') as f:
            f.write(html_no_name)
        print(f"✅ HTML preview (without name) saved to: {html_file_no_name}")
    except Exception as e:
        print(f"❌ Error generating HTML preview (no name): {e}")
    
    # Generate plain text version
    try:
        text_content = email_service._generate_welcome_email_text(user_name="Alex")
        text_file = os.path.join(output_dir, "welcome_email_preview.txt")
        with open(text_file, 'w', encoding='utf-8') as f:
            f.write(text_content)
        print(f"✅ Text preview saved to: {text_file}")
    except Exception as e:
        print(f"❌ Error generating text preview: {e}")
    
    print("=" * 60)
    print(f"\n📧 Open {os.path.join(output_dir, 'welcome_email_preview.html')} in your browser")
    print("   to see how the email will look!\n")
    print("💡 Tips for testing:")
    print("   - Open in Chrome/Firefox to see the design")
    print("   - Try resizing the window to test mobile responsiveness")
    print("   - The email is designed to look good in dark mode by default")
    print("   - Light mode email clients will also render it correctly (forced dark styling)")


def send_test_email(email: str, name: str = None):
    """Send a test welcome email to the specified address."""
    
    print("\n📧 Sending Test Welcome Email...")
    print("=" * 60)
    
    # Check if credentials are configured
    smtp_username = os.getenv("AWS_SES_SMTP_USERNAME")
    smtp_password = os.getenv("AWS_SES_SMTP_PASSWORD")
    
    if not smtp_username or not smtp_password:
        print("❌ ERROR: AWS SES SMTP credentials not configured!")
        print("\n   Please add the following to your backend/.env file:")
        print("   AWS_SES_SMTP_USERNAME=your_username")
        print("   AWS_SES_SMTP_PASSWORD=your_password")
        print("\n   You can get these from the AWS SES console under SMTP Settings.")
        return False
    
    print(f"📬 Recipient: {email}")
    if name:
        print(f"👤 Name: {name}")
    else:
        print("👤 Name: (not provided)")
    print(f"📤 From: {os.getenv('FROM_EMAIL', 'noreply@askclera.com')}")
    print("-" * 60)
    
    # Send the email
    success = send_welcome_email(user_email=email, user_name=name)
    
    if success:
        print("\n✅ SUCCESS! Welcome email sent successfully!")
        print(f"\n   Check your inbox at: {email}")
        print("   (Also check spam/junk folder if you don't see it)")
        print("\n📱 Tips:")
        print("   - View on desktop AND mobile to test responsiveness")
        print("   - Forward to yourself from a different client to test rendering")
        print("   - The email should look good on Gmail, Outlook, Apple Mail, etc.")
    else:
        print("\n❌ FAILED! Email could not be sent.")
        print("\n   Possible issues:")
        print("   - AWS SES credentials may be invalid")
        print("   - FROM_EMAIL domain may not be verified in AWS SES")
        print("   - Recipient email may be on AWS SES sandbox blocklist")
        print("   - Network/connectivity issues")
        print("\n   Check the backend logs for detailed error messages.")
    
    return success


def main():
    parser = argparse.ArgumentParser(
        description="Test the Clera welcome email",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s your_email@example.com           # Send test email
  %(prog)s your_email@example.com "John"    # Send with custom name
  %(prog)s --preview                        # Preview without sending
        """
    )
    
    parser.add_argument(
        'email',
        nargs='?',
        help='Email address to send the test email to'
    )
    parser.add_argument(
        'name',
        nargs='?',
        default=None,
        help='Optional name to include in the greeting'
    )
    parser.add_argument(
        '--preview',
        action='store_true',
        help='Generate HTML preview without sending email'
    )
    
    args = parser.parse_args()
    
    print("\n" + "=" * 60)
    print("           CLERA WELCOME EMAIL TEST SCRIPT")
    print("=" * 60)
    
    if args.preview:
        preview_email()
        return 0
    
    if not args.email:
        print("\n❌ ERROR: Please provide an email address or use --preview")
        print("\nUsage:")
        print("  python -m utils.email.test_welcome_email your_email@example.com")
        print("  python -m utils.email.test_welcome_email --preview")
        parser.print_help()
        return 1
    
    success = send_test_email(args.email, args.name)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
