const { body, param, query, validationResult } = require('express-validator');

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const INCIDENT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({ field: e.param, message: e.msg })),
    });
  }
  next();
}

const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Username is required and must be under 100 characters'),
  body('password')
    .isLength({ min: 1, max: 255 })
    .withMessage('Password is required'),
  handleValidationErrors,
];

const profileUpdateValidation = [
  body('username')
    .optional({ values: 'null' })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Username must be 1-100 characters'),
  body('email')
    .optional({ values: 'null' })
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email is required'),
  body('currentPassword')
    .if((value, { req }) => req.body.newPassword)
    .notEmpty()
    .withMessage('Current password is required to change password'),
  body('newPassword')
    .optional({ values: 'null' })
    .isLength({ min: 8, max: 255 })
    .withMessage('New password must be at least 8 characters'),
  handleValidationErrors,
];

const maintenanceScheduleValidation = [
  body('date').isISO8601().toDate().withMessage('A valid date is required'),
  body('department')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Department is required and must be under 255 characters'),
  body('room')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Room is required and must be under 255 characters'),
  body('asset_type')
    .isIn(ASSET_TYPES)
    .withMessage('Asset type must be one of: ' + ASSET_TYPES.join(', ')),
  body('asset_identifier')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Asset identifier must be under 255 characters'),
  body('description')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters'),
  body('technician')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Technician is required and must be under 255 characters'),
  body('priority')
    .optional({ values: 'null' })
    .isIn(MAINTENANCE_PRIORITIES)
    .withMessage('Priority must be one of: ' + MAINTENANCE_PRIORITIES.join(', ')),
  body('reminder_days')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('Reminder days must be a non-negative integer'),
  body('status')
    .optional({ values: 'null' })
    .isIn(MAINTENANCE_STATUSES)
    .withMessage('Status must be one of: ' + MAINTENANCE_STATUSES.join(', ')),
  handleValidationErrors,
];

const serviceRecordValidation = [
  body('schedule_id').isInt({ min: 1 }).withMessage('A valid schedule ID is required'),
  body('work_performed')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Work performed is required and must be under 5000 characters'),
  body('outcome')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Outcome must be under 2000 characters'),
  body('follow_up')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Follow-up must be under 2000 characters'),
  body('signer_name')
    .optional({ values: 'null' })
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Signer name must be 1-255 characters'),
  body('signer_date').optional({ values: 'null' }).isISO8601().toDate().withMessage('A valid signer date is required'),
  body('signature_data')
    .optional({ values: 'null' })
    .isString()
    .isLength({ max: 10000 })
    .withMessage('Signature data is too large'),
  handleValidationErrors,
];

const incidentValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Title is required and must be under 255 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Description is required and must be under 2000 characters'),
  body('department')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Department must be under 255 characters'),
  body('room')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Room must be under 255 characters'),
  body('asset_type')
    .optional({ values: 'null' })
    .isIn(ASSET_TYPES)
    .withMessage('Asset type must be one of: ' + ASSET_TYPES.join(', ')),
  body('asset_identifier')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Asset identifier must be under 255 characters'),
  body('priority')
    .optional({ values: 'null' })
    .isIn(MAINTENANCE_PRIORITIES)
    .withMessage('Priority must be one of: ' + MAINTENANCE_PRIORITIES.join(', ')),
  body('status')
    .optional({ values: 'null' })
    .isIn(INCIDENT_STATUSES)
    .withMessage('Status must be one of: ' + INCIDENT_STATUSES.join(', ')),
  handleValidationErrors,
];

const idParamValidation = [
  param('id').isInt({ min: 1 }).withMessage('A valid ID is required'),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  loginValidation,
  profileUpdateValidation,
  maintenanceScheduleValidation,
  serviceRecordValidation,
  incidentValidation,
  idParamValidation,
};
