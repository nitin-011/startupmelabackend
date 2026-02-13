import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing Email Configuration...');
console.log('Host:', process.env.SMTP_HOST);
console.log('Port:', process.env.SMTP_PORT);
console.log('User:', process.env.SMTP_USER);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false, // Use TLS
    logger: true,
    debug: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendTestEmail = async () => {
    try {
        const info = await transporter.sendMail({
            from: `"Test Script" <${process.env.SMTP_USER}>`,
            to: "offjayant@gmail.com", // Sending to a common test email or the user's email if known? defaulting to something generic or asking user
            // Actually, I should probably ask the user for a target email, but for now I'll try to send to the SMTP_USER itself if possible, or a placeholder.
            // Let's use the SMTP_USER as the recipient for the test to see if it loops back.
            to: process.env.SMTP_USER,
            subject: "Test Email from Startup Mela Backend",
            text: "If you receive this, the email configuration is working correctly.",
            html: "<b>If you receive this, the email configuration is working correctly.</b>",
        });

        console.log("Message sent: %s", info.messageId);
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

sendTestEmail();
