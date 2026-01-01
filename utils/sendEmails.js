import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "your-email@gmail.com",
    pass: "your-gmail-app-password",
  },
});

export const sendInvoiceEmail = async (ticket) => {
  const isStall = ticket.itemType === 'stall';
  const itemName = isStall ? ticket.stallType : ticket.passType;
  const subject = isStall 
    ? `Stall Booking Confirmed: ${ticket.stallType}` 
    : `Ticket Confirmed: ${ticket.passType}`;

  let gstBreakdown = '';
  if (isStall) {
    gstBreakdown = `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">Base Amount:</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${ticket.baseAmount?.toLocaleString('en-IN') || '0'}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">GST (18%):</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${ticket.gstAmount?.toLocaleString('en-IN') || '0'}</td>
      </tr>
    `;
  }

  const mailOptions = {
    from: `"Startup Mela" <your-email@gmail.com>`,
    to: ticket.email,
    subject: subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #00C2FF 0%, #0070FF 50%, #00E29B 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; }
          .total-row { font-weight: bold; font-size: 18px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Payment Successful!</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${ticket.name}</strong>,</p>
            <p>${isStall ? 'Your exhibition stall booking' : 'Your ticket'} for <strong>${itemName}</strong> has been confirmed.</p>
            
            <div class="details">
              <h3>${isStall ? '📦 Stall Booking Details' : '🎫 Ticket Details'}</h3>
              <table>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Order ID:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${ticket.orderId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${isStall ? 'Stall Type:' : 'Pass Type:'}</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${itemName}</td>
                </tr>
                ${ticket.quantity > 1 ? `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Quantity:</strong></td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${ticket.quantity}</td>
                </tr>
                ` : ''}
                ${gstBreakdown}
                <tr class="total-row">
                  <td style="padding: 12px 8px;">Total Amount Paid:</td>
                  <td style="padding: 12px 8px; text-align: right; color: #0070FF;">₹${ticket.amount?.toLocaleString('en-IN')}</td>
                </tr>
              </table>
            </div>

            ${isStall ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="margin: 0;"><strong>📍 Next Steps:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Our team will contact you within 24 hours</li>
                <li>Stall location will be assigned on first-come, first-served basis</li>
                <li>Setup guidelines will be shared via email</li>
              </ul>
            </div>
            ` : `
            <p style="margin: 20px 0;">Please save this email as proof of purchase. Show this confirmation at the venue for entry.</p>
            `}

            <p style="margin: 20px 0 0 0;">See you at <strong>Startup Mela 2026</strong>! 🚀</p>
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
