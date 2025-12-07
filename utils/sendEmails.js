import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendInvoiceEmail = async (ticket) => {
  const mailOptions = {
    from: `"Startup Mela" <${process.env.EMAIL_USER}>`,
    to: ticket.email,
    subject: `Ticket Confirmed: ${ticket.passType}`,
    html: `
      <h1>Payment Successful!</h1>
      <p>Hi ${ticket.name},</p>
      <p>Your ticket for <strong>${ticket.passType}</strong> is confirmed.</p>
      <p><strong>Transaction ID:</strong> ${ticket.transactionId}</p>
      <p><strong>Amount Paid:</strong> ₹${ticket.amount}</p>
      <br/>
      <p>See you at the event!</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${ticket.email}`);
  } catch (error) {
    console.error('❌ Email failed:', error);
  }
};
