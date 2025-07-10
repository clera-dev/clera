# Email Configuration Setup for Account Closure Notifications

## AWS SES Configuration

Your AWS SES setup is already configured for the us-west-2 (Oregon) region with production access.

### Current AWS SES Details:
- **Region**: us-west-2 (Oregon)
- **SMTP Server**: email-smtp.us-west-2.amazonaws.com
- **SMTP Port**: 587 (STARTTLS)
- **SMTP Username**: [YOUR_AWS_SES_SMTP_USERNAME]
- **Daily Limit**: 50,000 messages per day
- **Rate Limit**: 14 messages per second

## Required Environment Variables

Add these environment variables to your backend configuration:

### Production Environment Variables
```bash
# AWS SES SMTP Configuration
AWS_SES_SMTP_USERNAME=[YOUR_AWS_SES_SMTP_USERNAME]
AWS_SES_SMTP_PASSWORD=[YOUR_AWS_SES_SMTP_PASSWORD]

# Email From Configuration
FROM_EMAIL=noreply@askclera.com
FROM_NAME=Clera Investment Services

# Support Contact Information (already correctly set)
SUPPORT_EMAIL=support@askclera.com
SUPPORT_PHONE=1-800-CLERA-01
```

### Development/Testing Environment Variables
For development, you can use the same credentials but with a different FROM_EMAIL:

```bash
# AWS SES SMTP Configuration (same as production)
AWS_SES_SMTP_USERNAME=[YOUR_AWS_SES_SMTP_USERNAME]
AWS_SES_SMTP_PASSWORD=[YOUR_AWS_SES_SMTP_PASSWORD]

# Email From Configuration (use test domain or verified email)
FROM_EMAIL=test@askclera.com
FROM_NAME=Clera Investment Services (Test)

# Support Contact Information
SUPPORT_EMAIL=support@askclera.com
SUPPORT_PHONE=1-800-CLERA-01
```

## Security Requirements

### Critical Security Notes:
- **NEVER commit AWS credentials to version control**
- **NEVER include credentials in documentation**
- **Use AWS IAM roles when possible** instead of hardcoded credentials
- **Rotate credentials regularly** and immediately if exposed
- **Use AWS Systems Manager Parameter Store** or **AWS Secrets Manager** for production

### How to Get AWS SES SMTP Credentials:
1. Go to AWS SES Console → SMTP Settings
2. Create SMTP credentials for your IAM user
3. Store credentials securely in your deployment environment
4. Use environment variables or AWS Parameter Store

## Email Templates Generated

The following email templates have been created:

1. **Account Closure Initiation Email**: Sent when user starts the closure process
   - Professional HTML design with gradient header
   - Clear confirmation details table
   - Timeline of what happens next
   - Warning about irreversible process
   - Support contact information

2. **Account Closure Completion Email**: Sent when closure is finalized
   - Confirmation of successful closure
   - Final transfer details
   - Important information about account status
   - Tax document timeline
   - Support contact for questions

## Email Features

### Professional Design
- Responsive HTML templates with professional styling
- Both HTML and plain text versions for compatibility
- Branded with Clera Investment Services styling
- Clear confirmation numbers and reference information

### Content Includes
- ✅ User personalization with name and account details
- ✅ Unique confirmation numbers for tracking
- ✅ Clear timeline expectations (3-5 business days)
- ✅ Support contact information (support@askclera.com)
- ✅ Important warnings about irreversible actions
- ✅ Professional branding and footer

### Security & Compliance
- ✅ Automated sending (no manual intervention required)
- ✅ Proper SMTP encryption using STARTTLS
- ✅ AWS SES reputation management
- ✅ Production-grade email delivery
- ✅ Proper error handling and logging

## Testing the Email System

### Preview Generated Emails
Email previews have been generated in the `email_previews/` directory:
- `account_closure_initiation_preview.html` - Initial confirmation email
- `account_closure_completion_preview.html` - Final completion email
- `account_closure_initiation_preview.txt` - Plain text version
- `account_closure_completion_preview.txt` - Plain text completion

### Test Email Sending
To test email sending in development:

1. Set up the environment variables above
2. Use a verified email address in AWS SES for testing
3. Send test emails to yourself before production deployment

### Production Deployment Checklist

- [ ] Environment variables configured in production
- [ ] FROM_EMAIL domain verified in AWS SES
- [ ] support@askclera.com configured and monitored
- [ ] Email templates tested and approved
- [ ] Error logging configured for failed email sends
- [ ] Backup notification system (optional)

## Email Flow Integration

The email service is automatically integrated with the account closure process:

1. **Initiation**: Email sent when `initiate_account_closure()` is called
2. **Completion**: Email sent when `close_account()` finalizes the closure
3. **Error Handling**: Failed emails are logged but don't block the closure process
4. **User Experience**: Users receive immediate confirmation and final notification

## Support Information

All emails include your support contact information:
- **Email**: support@askclera.com
- **Phone**: 1-800-CLERA-01

Users are instructed to reference their confirmation number when contacting support.

## Next Steps

1. **Configure Environment Variables**: Add the AWS SES credentials to your backend environment
2. **Verify Domain**: Ensure your FROM_EMAIL domain is verified in AWS SES
3. **Test in Sandbox**: Test the complete flow in your sandbox environment
4. **Production Deployment**: Deploy with confidence knowing emails will be sent

The email system is now ready for production use with your AWS SES configuration!

## Security Incident Response

### If Credentials Are Exposed:
1. **Immediately rotate AWS SES SMTP credentials** in AWS Console
2. **Update environment variables** in all deployment environments
3. **Review access logs** for any unauthorized usage
4. **Monitor email sending patterns** for anomalies
5. **Update this documentation** if credentials were committed

### Security Best Practices:
- **Use AWS IAM roles** instead of hardcoded credentials when possible
- **Implement credential rotation** every 90 days
- **Use AWS Secrets Manager** for production credential storage
- **Enable AWS CloudTrail** for credential usage monitoring
- **Implement least privilege access** for email sending permissions

### Monitoring & Alerting:
- **Set up CloudWatch alarms** for unusual email sending patterns
- **Monitor SES reputation metrics** for deliverability issues
- **Log all email sending attempts** for audit purposes
- **Set up alerts for credential failures** or authentication errors

### Compliance Considerations:
- **Email content must comply** with financial services regulations
- **Maintain audit trails** of all account closure communications
- **Ensure data retention** policies are followed for email records
- **Implement proper error handling** to prevent data leakage 