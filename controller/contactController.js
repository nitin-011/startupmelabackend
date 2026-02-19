import Inquiry from '../model/Inquiry.js';

export const submitInquiry = async (req, res) => {
  try {
    const inquiry = new Inquiry(req.body);
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
    res.status(400).json({ success: false, message: error.message });
  }
};