import express from 'express';
import { uploadStudentDocuments, uploadStudentDocumentsMiddleware } from '../controller/uploadController.js';

const router = express.Router();

// POST /api/upload/student-documents
router.post('/student-documents', uploadStudentDocumentsMiddleware, uploadStudentDocuments);

export default router;
