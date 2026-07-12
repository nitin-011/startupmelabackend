import Inquiry from '../model/Inquiry.js';

export const submitInquiry = async (req, res) => {
  try {
    const { name, email, message, category } = req.body;

    // Input validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const inquiry = new Inquiry({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
      category: category || 'General',
    });
    await inquiry.save();

    // Emit real-time event to all admin clients
    if (global.adminNamespace) {
      const inquiryData = {
        inquiryId: inquiry._id,
        name: inquiry.name,
        email: inquiry.email,
        category: inquiry.category,
        message: inquiry.message,
        createdAt: inquiry.createdAt
      };
      global.adminNamespace.emit('inquiry:created', inquiryData);
      console.log(`📡 Emitted 'inquiry:created' event for inquiry ${inquiry._id} to ${global.adminNamespace.sockets.size} admin client(s)`);
    }

    res.status(201).json({ success: true, message: 'Inquiry received' });
  } catch (error) {
    console.error('Contact submit error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};