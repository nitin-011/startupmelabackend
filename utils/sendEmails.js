import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: "Contact@startupmela.com",
    pass: "NitinTanuStartupmela@2026",
  },
});

export const sendInvoiceEmail = async (ticket) => {
  const isStall = ticket.itemType === 'stall';
  const itemName = isStall ? ticket.stallType : ticket.passType;
  const subject = isStall
    ? `Stall Booking Confirmed: ${ticket.stallType}`
    : `Ticket Confirmed: ${ticket.passType}`;

  const mailOptions = {
    from: `"Startup Mela" <Contact@startupmela.com>`,
    to: ticket.email,
    subject: subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0;
            padding: 0;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
          }
          .header { 
            background: linear-gradient(135deg, #00C2FF 0%, #0070FF 50%, #00E29B 100%); 
            color: white; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
          }
          .content { 
            background: #f9f9f9; 
            padding: 30px; 
            border-radius: 0 0 10px 10px; 
          }
          .greeting {
            font-size: 16px;
            margin-bottom: 20px;
          }
          .code-box {
            background: white;
            border: 3px solid #0070FF;
            border-radius: 12px;
            padding: 25px;
            text-align: center;
            margin: 25px 0;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .code-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .code {
            font-size: 32px;
            font-weight: bold;
            color: #0070FF;
            letter-spacing: 4px;
            font-family: 'Courier New', monospace;
          }
          .instructions {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            color: #666; 
            font-size: 12px; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🎉 Registration Confirmed!</h1>
          </div>
          <div class="content">
            <p class="greeting">Dear <strong>${ticket.name}</strong>,</p>
            
            <p>Thank you for confirming your presence for <strong>STARTUP MELA 2026</strong> scheduled on <strong>28th February and 1st March 2026</strong>.</p>
            
            <div class="code-box">
              <div class="code-label">Your Unique Registration Code</div>
              <div class="code">${ticket.verificationCode}</div>
            </div>
            
            <div class="instructions">
              <p style="margin: 0;"><strong>⚠️ Important Instructions:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Kindly show this code at the entrance on your arrival</li>
                <li>Please don't share this code with anyone</li>
                <li>Save this email for reference</li>
              </ul>
            </div>
            
            <p style="margin-top: 25px;">We look forward to seeing you at the event!</p>
            
            <p style="margin-top: 30px;">Thank You,<br><strong>Startup Mela 2026</strong></p>
          </div>
          <div class="footer">
            <p>Questions? Contact us at contact@startupmela.com or call 7743096565</p>
            <p>© 2026 Startup Mela. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${ticket.email}`);
  } catch (error) {
    console.error('❌ Email failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};
