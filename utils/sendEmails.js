import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3'
  }
});

// ─── Shared HTML helpers ─────────────────────────────────────────────────────

const baseStyles = `
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #00C2FF 0%, #0070FF 50%, #00E29B 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
  .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
  .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  .highlight-box { background: white; border-left: 4px solid #0070FF; border-radius: 8px; padding: 20px; margin: 20px 0; }
  .info-box { background: #e8f4fd; border-left: 4px solid #0070FF; padding: 15px; margin: 20px 0; border-radius: 4px; }
  .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }
`;

const footerHtml = `
  <div class="footer">
    <p>Questions? Contact us at contact@startupmela.com or call 7743096565</p>
    <p>© 2027 Startup Mela. All rights reserved.</p>
  </div>
`;

// ─── 1. Ticket / Booking Confirmation ────────────────────────────────────────

export const sendInvoiceEmail = async (ticket) => {
  const isStall = ticket.itemType === 'stall';
  const subject = isStall
    ? `Stall Booking Confirmed: ${ticket.stallType}`
    : `Ticket Confirmed: ${ticket.passType}`;

  const mailOptions = {
    from: `"Startup Mela" <${process.env.SMTP_USER}>`,
    to: ticket.email,
    subject: subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          ${baseStyles}
          .code-box { background: white; border: 3px solid #0070FF; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .code-label { font-size: 14px; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
          .code { font-size: 32px; font-weight: bold; color: #0070FF; letter-spacing: 4px; font-family: 'Courier New', monospace; }
          .instructions { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">🎉 Registration Confirmed!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${ticket.name}</strong>,</p>
            <p>Thank you for confirming your presence for <strong>STARTUP MELA 2027</strong> scheduled on <strong>27th, 28th and 29th March 2027</strong>.</p>
            <div class="code-box">
              <div class="code-label">Your Unique Registration Code</div>
              <div class="code">${ticket.verificationCode}</div>
            </div>
            <div class="instructions">
              <p style="margin:0;"><strong>⚠️ Important Instructions:</strong></p>
              <ul style="margin:10px 0;">
                <li>Kindly show this code at the entrance on your arrival</li>
                <li>Please don't share this code with anyone</li>
                <li>Save this email for reference</li>
              </ul>
            </div>
            <p style="margin-top:25px;">We look forward to seeing you at the event!</p>
            <p style="margin-top:30px;">Thank You,<br><strong>Startup Mela 2027</strong></p>
          </div>
          ${footerHtml}
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Invoice email sent to ${ticket.email}`);
  } catch (error) {
    console.error('❌ Invoice email failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// ─── 2. Volunteer Application Acknowledgement ─────────────────────────────────

export const sendVolunteerConfirmationEmail = async (volunteer) => {
  const mailOptions = {
    from: `"Startup Mela" <${process.env.SMTP_USER}>`,
    to: volunteer.email,
    subject: `Application Received: ${volunteer.role} — Startup Mela 2027`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">🙌 Application Received!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${volunteer.name}</strong>,</p>
            <p>Thank you for applying to volunteer at <strong>STARTUP MELA 2027</strong>! We've successfully received your application and our team will review it shortly.</p>

            <div class="highlight-box">
              <h3 style="margin:0 0 12px 0; color:#0070FF;">Your Application Details</h3>
              <table style="width:100%; border-collapse:collapse;">
                <tr>
                  <td style="padding:6px 0; color:#666; width:40%;">Role Applied For</td>
                  <td style="padding:6px 0;"><strong>${volunteer.role}</strong></td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#666;">College Year</td>
                  <td style="padding:6px 0;"><strong>${volunteer.collegeYear}</strong></td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#666;">Email</td>
                  <td style="padding:6px 0;"><strong>${volunteer.email}</strong></td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#666;">Phone</td>
                  <td style="padding:6px 0;"><strong>${volunteer.phone}</strong></td>
                </tr>
              </table>
            </div>

            <div class="info-box">
              <p style="margin:0;"><strong>📋 What happens next?</strong></p>
              <ul style="margin:10px 0;">
                <li>Our volunteer coordination team will review your application</li>
                <li>Shortlisted candidates will be contacted within 5–7 working days</li>
                <li>Keep an eye on your inbox (including spam folder)</li>
              </ul>
            </div>

            <p style="margin-top:25px;">We're excited about the possibility of having you on our team. Thank you for your enthusiasm!</p>
            <p style="margin-top:30px;">With gratitude,<br><strong>Startup Mela 2027 Team</strong></p>
          </div>
          ${footerHtml}
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Volunteer confirmation email sent to ${volunteer.email}`);
  } catch (error) {
    console.error('❌ Volunteer email failed:', error);
    throw new Error(`Failed to send volunteer email: ${error.message}`);
  }
};

// ─── 3. Contact Form Acknowledgement ─────────────────────────────────────────

export const sendContactAcknowledgementEmail = async (inquiry) => {
  const mailOptions = {
    from: `"Startup Mela" <${process.env.SMTP_USER}>`,
    to: inquiry.email,
    subject: `We received your message — Startup Mela 2027`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">✉️ Message Received!</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${inquiry.name}</strong>,</p>
            <p>Thank you for reaching out to us! We've received your message and will get back to you as soon as possible, typically within <strong>24–48 hours</strong>.</p>

            <div class="highlight-box">
              <h3 style="margin:0 0 12px 0; color:#0070FF;">Your Message Summary</h3>
              <table style="width:100%; border-collapse:collapse;">
                <tr>
                  <td style="padding:6px 0; color:#666; width:30%; vertical-align:top;">Category</td>
                  <td style="padding:6px 0;"><strong>${inquiry.category || 'General'}</strong></td>
                </tr>
                <tr>
                  <td style="padding:6px 0; color:#666; vertical-align:top;">Message</td>
                  <td style="padding:6px 0; font-style:italic; color:#555;">"${inquiry.message}"</td>
                </tr>
              </table>
            </div>

            <div class="success-box">
              <p style="margin:0;">✅ Your inquiry has been logged. Our team will respond to <strong>${inquiry.email}</strong>.</p>
            </div>

            <p style="margin-top:25px;">In the meantime, feel free to explore our website or reach us directly at <strong>contact@startupmela.com</strong>.</p>
            <p style="margin-top:30px;">Warm regards,<br><strong>Startup Mela 2027 Team</strong></p>
          </div>
          ${footerHtml}
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Contact acknowledgement email sent to ${inquiry.email}`);
  } catch (error) {
    console.error('❌ Contact email failed:', error);
    throw new Error(`Failed to send contact email: ${error.message}`);
  }
};

