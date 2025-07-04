#!/usr/bin/env python3

"""
Email Preview Utility for Account Closure Notifications

This utility generates HTML previews of the account closure emails
so you can see exactly what your customers will receive.
"""

import os
import sys
from datetime import datetime

# Add the backend directory to the path so we can import the email service
backend_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(backend_path)

from utils.email.email_service import EmailService

def generate_email_preview(output_dir: str = "email_previews"):
    """
    Generate HTML preview files for account closure emails.
    
    Args:
        output_dir: Directory to save preview files
    """
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Initialize email service
    email_service = EmailService()
    
    # Sample data for preview
    sample_data = {
        "user_name": "John Smith",
        "account_id": "12345678",
        "confirmation_number": "CLA-20241219-123456",
        "estimated_completion": "3-5 business days",
        "final_transfer_amount": 15687.45
    }
    
    print("Generating email previews...")
    
    # Generate account closure initiation email preview
    try:
        initiation_html = email_service._generate_closure_email_html(
            user_name=sample_data["user_name"],
            account_id=sample_data["account_id"],
            confirmation_number=sample_data["confirmation_number"],
            estimated_completion=sample_data["estimated_completion"]
        )
        
        initiation_file = os.path.join(output_dir, "account_closure_initiation_preview.html")
        with open(initiation_file, 'w', encoding='utf-8') as f:
            f.write(initiation_html)
        
        print(f"✅ Account closure initiation email preview saved to: {initiation_file}")
        
    except Exception as e:
        print(f"❌ Error generating initiation email preview: {e}")
    
    # Generate account closure completion email preview
    try:
        completion_html = email_service._generate_closure_complete_email_html(
            user_name=sample_data["user_name"],
            account_id=sample_data["account_id"],
            confirmation_number=sample_data["confirmation_number"],
            final_transfer_amount=sample_data["final_transfer_amount"]
        )
        
        completion_file = os.path.join(output_dir, "account_closure_completion_preview.html")
        with open(completion_file, 'w', encoding='utf-8') as f:
            f.write(completion_html)
        
        print(f"✅ Account closure completion email preview saved to: {completion_file}")
        
    except Exception as e:
        print(f"❌ Error generating completion email preview: {e}")
    
    # Generate text versions
    try:
        initiation_text = email_service._generate_closure_email_text(
            user_name=sample_data["user_name"],
            account_id=sample_data["account_id"],
            confirmation_number=sample_data["confirmation_number"],
            estimated_completion=sample_data["estimated_completion"]
        )
        
        initiation_text_file = os.path.join(output_dir, "account_closure_initiation_preview.txt")
        with open(initiation_text_file, 'w', encoding='utf-8') as f:
            f.write(initiation_text)
        
        print(f"✅ Account closure initiation text email preview saved to: {initiation_text_file}")
        
    except Exception as e:
        print(f"❌ Error generating initiation text email preview: {e}")
    
    try:
        completion_text = email_service._generate_closure_complete_email_text(
            user_name=sample_data["user_name"],
            account_id=sample_data["account_id"],
            confirmation_number=sample_data["confirmation_number"],
            final_transfer_amount=sample_data["final_transfer_amount"]
        )
        
        completion_text_file = os.path.join(output_dir, "account_closure_completion_preview.txt")
        with open(completion_text_file, 'w', encoding='utf-8') as f:
            f.write(completion_text)
        
        print(f"✅ Account closure completion text email preview saved to: {completion_text_file}")
        
    except Exception as e:
        print(f"❌ Error generating completion text email preview: {e}")
    
    print(f"\n📧 Email previews generated successfully!")
    print(f"📁 Open the files in '{output_dir}' to see how the emails will look.")
    print(f"🌐 Open the .html files in a web browser to see the full email design.")
    print(f"📄 Check the .txt files to see the plain text version.")

def display_sample_email_inline():
    """Display a sample email directly in the console."""
    
    email_service = EmailService()
    
    sample_html = email_service._generate_closure_email_html(
        user_name="John Smith",
        account_id="12345678",
        confirmation_number="CLA-20241219-123456",
        estimated_completion="3-5 business days"
    )
    
    print("\n" + "="*80)
    print("SAMPLE ACCOUNT CLOSURE EMAIL (HTML Version)")
    print("="*80)
    print(sample_html)
    print("\n" + "="*80)

if __name__ == "__main__":
    print("Account Closure Email Preview Generator")
    print("=====================================")
    
    # Generate preview files
    generate_email_preview()
    
    # Optionally display inline (uncomment to see in console)
    # display_sample_email_inline() 