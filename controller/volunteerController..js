import Volunteer from "../model/Volunteer.js";

/**
 * Submit volunteer application
 * Expects JSON body with required fields:
 *  name, email, phone, collegeYear, role, resumeLink, etc.
 */
export const submitVolunteer = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      collegeYear,
      role,
      q1,
      q2,
      q3,
      q4,
      q5,
      hours,
      resumeLink,
    } = req.body;

    // Basic server-side validation
    if (!name || !email || !phone || !collegeYear || !role || !resumeLink) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, email, phone, collegeYear, role, resumeLink",
      });
    }

    const volunteer = new Volunteer({
      name,
      email,
      phone,
      collegeYear,
      role,
      q1,
      q2,
      q3,
      q4,
      q5,
      hours,
      resumeLink,
    });

    await volunteer.save();

    // Emit real-time event to all admin clients
    if (global.adminNamespace) {
      const volunteerData = {
        volunteerId: volunteer._id,
        name: volunteer.name,
        email: volunteer.email,
        phone: volunteer.phone,
        collegeYear: volunteer.collegeYear,
        role: volunteer.role,
        createdAt: volunteer.createdAt
      };
      global.adminNamespace.emit('volunteer:created', volunteerData);
      console.log(`📡 Emitted 'volunteer:created' event for volunteer ${volunteer._id} to ${global.adminNamespace.sockets.size} admin client(s)`);
    }

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      volunteerId: volunteer._id,
    });
  } catch (error) {
    // Pass error to error-handling middleware if you have one
    console.error("Volunteer submit error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
