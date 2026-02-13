import { upload } from '../config/cloudinary.js';

// Upload student documents endpoint
export const uploadStudentDocuments = async (req, res) => {
    try {
        console.log('📤 Student document upload request received');
        console.log('Files:', req.files);
        console.log('Body:', req.body);

        // Validate that required files are present
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const { studentId, founderProof, coFounderStudentId } = req.files;
        const { linkedinProfile, hasCoFounder } = req.body;

        // Validate required files
        if (!studentId || studentId.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Student ID is required'
            });
        }

        if (!founderProof || founderProof.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Founder proof document is required'
            });
        }

        // Validate LinkedIn profile
        if (!linkedinProfile || !linkedinProfile.trim()) {
            return res.status(400).json({
                success: false,
                message: 'LinkedIn profile URL is required'
            });
        }

        const linkedinRegex = /^(https?:\/\/)?(www\.)?linkedin\.com\/(company|in)\/.+$/i;
        if (!linkedinRegex.test(linkedinProfile.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid LinkedIn profile URL'
            });
        }

        // Validate co-founder student ID if applicable
        if (hasCoFounder === 'true' && (!coFounderStudentId || coFounderStudentId.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Co-founder student ID is required'
            });
        }

        // Prepare response with uploaded file URLs
        const uploadedDocuments = {
            studentIdUrl: studentId[0].path,
            founderProofUrl: founderProof[0].path,
            linkedinProfile: linkedinProfile.trim(),
            hasCoFounder: hasCoFounder === 'true',
            coFounderStudentIdUrl: hasCoFounder === 'true' && coFounderStudentId ? coFounderStudentId[0].path : null,
            termsAccepted: true,
            termsAcceptedAt: new Date().toISOString()
        };

        console.log('✅ Documents uploaded successfully:', uploadedDocuments);

        return res.json({
            success: true,
            message: 'Documents uploaded successfully',
            data: uploadedDocuments
        });

    } catch (error) {
        console.error('❌ Upload error:', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload documents',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Multer middleware for handling multiple file uploads
export const uploadStudentDocumentsMiddleware = upload.fields([
    { name: 'studentId', maxCount: 1 },
    { name: 'founderProof', maxCount: 1 },
    { name: 'coFounderStudentId', maxCount: 1 }
]);
