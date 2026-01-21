import nodemailer from 'nodemailer';

export const sendTestEmail = async (req, res) => {
    const {
        email,
        host = process.env.SMTP_HOST || 'smtp.hostinger.com',
        port = process.env.SMTP_PORT || 465,
        user = process.env.SMTP_USER,
        pass = process.env.SMTP_PASS
    } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: "Email is required in body" });
    }

    console.log(`🧪 Attempting to send test email to ${email}`);
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   User: ${user ? '***HIDDEN***' : 'MISSING'}`);

    const transporter = nodemailer.createTransport({
        host: host,
        port: parseInt(port),
        secure: parseInt(port) === 465, // True for 465, false for 587
        auth: {
            user: user,
            pass: pass,
        },
        connectionTimeout: 10000, // 10 seconds
        debug: true,      // include debug output
        logger: true      // log information in console
    });

    try {
        // 1. Verify connection configuration
        await transporter.verify();
        console.log('   ✅ SMTP Connection Verified');

        // 2. Send Email
        const info = await transporter.sendMail({
            from: `"Debug Test" <${user}>`,
            to: email,
            subject: "Startup Mela - Debug Test Email",
            text: "If you are reading this, email sending is working!",
            html: "<b>If you are reading this, email sending is working!</b>",
        });

        console.log('   ✅ Email sent:', info.messageId);
        return res.json({
            success: true,
            message: "Email sent successfully",
            messageId: info.messageId,
            config: { host, port }
        });

    } catch (error) {
        console.error('   ❌ Email Test Failed:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            command: error.command,
            config: { host, port }
        });
    }
};
