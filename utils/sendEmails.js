import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "your-email@gmail.com",
    pass: "your-gmail-app-password",
  },
});

export const sendInvoiceEmail = async (ticket) => {
  const mailOptions = {
    from: `"Startup Mela" <your-email@gmail.com>`,
    to: ticket.email,
    subject: `Ticket Confirmed: ${ticket.passType}`,
    html: `
      <h1>Payment Successful!</h1>
      <p>Hi ${ticket.name},</p>
      <p>Your ticket for <strong>${ticket.passType}</strong> is confirmed.</p>
      <p><strong>Order ID:</strong> ${ticket.orderId}</p>
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
    throw new Error(`Failed to send email: ${error.message}`);
  }
};
