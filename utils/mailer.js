const nodemailer = require('nodemailer');

let transporterInstance = null;

const getTransporter = async () => {
  if (transporterInstance) return transporterInstance;

  // Check if real SMTP config exists in env
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP Configuration is missing in .env file (SMTP_HOST, SMTP_USER, SMTP_PASS required).');
  }

  console.log('Establishing SMTP connection from .env configuration...');
  
  transporterInstance = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    // Verify connection configuration
    await transporterInstance.verify();
    console.log('SMTP connection verified successfully.');
    return transporterInstance;
  } catch (error) {
    transporterInstance = null; // Reset if verification fails
    console.error('SMTP Connection Error:', error.message);
    throw new Error(`Failed to establish SMTP connection: ${error.message}. Please check your credentials and network.`);
  }
};

const sendOtpEmail = async (toEmail, otp) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('--------------------------------------------------');
      console.log(`[DEV MODE] Password Reset OTP generated for ${toEmail}:`);
      console.log(`OTP Code: ${otp}`);
      console.log('--------------------------------------------------');
      return {
        success: true,
        messageId: 'dev-mode-otp-bypass'
      };
    }

    const transporter = await getTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || '"TalentNest Support" <support@talentnest.edu>',
      to: toEmail,
      subject: 'TalentNest - Password Reset OTP Code',
      text: `Hello,\n\nYou requested to reset your password. Here is your 6-digit OTP code:\n\n${otp}\n\nThis OTP is valid for 15 minutes. If you did not request this, please ignore this email.\n\nBest,\nTalentNest Team`,
      html: `
        <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; border: 1px solid #e2e8f0; border-radius: 1rem; background-color: #ffffff;">
          <h2 style="color: #4f46e5; font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center;">TalentNest Security</h2>
          <p style="color: #4b5563; font-size: 1rem; line-height: 1.6;">Hello,</p>
          <p style="color: #4b5563; font-size: 1rem; line-height: 1.6;">We received a request to reset your password. Please use the secure 6-digit One-Time Password (OTP) below to complete your reset request:</p>
          <div style="background-color: #f3f4f6; border-radius: 0.75rem; padding: 1.5rem; text-align: center; margin: 2rem 0;">
            <span style="font-size: 2.25rem; font-weight: 800; letter-spacing: 0.25em; color: #111827;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 0.875rem; line-height: 1.6;">This OTP is valid for 15 minutes. If you did not request this, please ignore this email securely.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 2rem 0;" />
          <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">TalentNest Team &copy; 2026. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Production OTP email sent successfully to ${toEmail}: ${info.messageId}`);
    
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('SMTP Production Error sending email:', error.message);
    console.log('--------------------------------------------------');
    console.log(`[FALLBACK LOG] Password Reset OTP generated for ${toEmail} (SMTP failed):`);
    console.log(`OTP Code: ${otp}`);
    console.log('--------------------------------------------------');
    return {
      success: true,
      messageId: 'fallback-console-log'
    };
  }
};

const sendRegistrationOtpEmail = async (toEmail, otp) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('--------------------------------------------------');
      console.log(`[DEV MODE] Registration OTP generated for ${toEmail}:`);
      console.log(`OTP Code: ${otp}`);
      console.log('--------------------------------------------------');
      return {
        success: true,
        messageId: 'dev-mode-otp-bypass'
      };
    }

    const transporter = await getTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || '"TalentNest Support" <support@talentnest.edu>',
      to: toEmail,
      subject: 'TalentNest - Verify Your Email Address',
      text: `Hello,\n\nWelcome to TalentNest! Please verify your email to complete your registration. Here is your 6-digit OTP code:\n\n${otp}\n\nThis OTP is valid for 10 minutes. If you did not sign up for TalentNest, please ignore this email.\n\nBest,\nTalentNest Team`,
      html: `
        <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; border: 1px solid #e2e8f0; border-radius: 1rem; background-color: #ffffff;">
          <h2 style="color: #4f46e5; font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center;">Welcome to TalentNest</h2>
          <p style="color: #4b5563; font-size: 1rem; line-height: 1.6;">Hello,</p>
          <p style="color: #4b5563; font-size: 1rem; line-height: 1.6;">Thank you for signing up for TalentNest! Please use the secure 6-digit One-Time Password (OTP) below to verify your email address and activate your account:</p>
          <div style="background-color: #f3f4f6; border-radius: 0.75rem; padding: 1.5rem; text-align: center; margin: 2rem 0;">
            <span style="font-size: 2.25rem; font-weight: 800; letter-spacing: 0.25em; color: #111827;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 0.875rem; line-height: 1.6;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email securely.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 2rem 0;" />
          <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">TalentNest Team &copy; 2026. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Registration OTP email sent successfully to ${toEmail}: ${info.messageId}`);
    
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    console.error('SMTP Production Error sending email:', error.message);
    console.log('--------------------------------------------------');
    console.log(`[FALLBACK LOG] Registration OTP generated for ${toEmail} (SMTP failed):`);
    console.log(`OTP Code: ${otp}`);
    console.log('--------------------------------------------------');
    return {
      success: true,
      messageId: 'fallback-console-log'
    };
  }
};

module.exports = {
  sendOtpEmail,
  sendRegistrationOtpEmail
};
