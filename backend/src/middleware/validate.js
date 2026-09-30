const { body, param, query, validationResult } = require('express-validator');

const ASSET_TYPES = ['laptop', 'desktop', 'network_equipment', 'printer'];
const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'];
const RECURRENCE_RULES = ['none', 'monthly', 'quarterly', 'annual'];
const INCIDENT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const LIFECYCLE_STATUSES = ['procurement', 'deployed', 'in_service', 'maintenance', 'retired', 'disposed'];
const ASSET_EVENT_TYPES = [
  'procurement', 'deployment', 'maintenance', 'repair', 'upgrade',
  'relocation', 'retirement', 'disposal', 'status_change', 'note',
];
const DOWNTIME_WINDOW_TYPES = ['planned', 'unplanned', 'maintenance'];
const ANALYTICS_PERIODS = ['7d', '30d', '90d', '6m', '12m', 'ytd'];
const TREND_INTERVALS = ['day', 'week'];

const isOptional = { optional: { values: 'null' } };
const USER_ROLES = ['admin', 'manager', 'developer', 'user'];

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
  body('scheduled_at')
    .optional(isOptional)
    .isISO8601()
    .withMessage('A valid scheduled date and time is required'),
  body('date')
    .optional(isOptional)
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 value'),
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
    .optional(isOptional)
    .trim()
    .isLength({ max: 255 })
    .withMessage('Asset identifier must be under 255 characters'),
  body('asset_id').optional(isOptional).isInt({ min: 1 }).withMessage('Asset must be a valid ID'),
  body('description')
    .optional(isOptional)
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be under 2000 characters'),
  body('technician')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Technician is required and must be under 255 characters'),
  body('technician_user_id').optional(isOptional).isInt({ min: 1 }).withMessage('Technician account must be a valid ID'),
  body('priority')
    .optional(isOptional)
    .isIn(MAINTENANCE_PRIORITIES)
    .withMessage('Priority must be one of: ' + MAINTENANCE_PRIORITIES.join(', ')),
  body('reminder_days')
    .optional(isOptional)
    .isInt({ min: 0 })
    .withMessage('Reminder days must be a non-negative integer'),
  body('status')
    .optional(isOptional)
    .isIn(MAINTENANCE_STATUSES)
    .withMessage('Status must be one of: ' + MAINTENANCE_STATUSES.join(', ')),
  body('duration_minutes')
    .optional(isOptional)
    .isInt({ min: 15, max: 1440 })
    .withMessage('Duration must be between 15 and 1440 minutes'),
  body('recurrence_rule')
    .optional(isOptional)
    .isIn(RECURRENCE_RULES)
    .withMessage('Recurrence rule must be one of: ' + RECURRENCE_RULES.join(', ')),
  body('recurrence_interval')
    .optional(isOptional)
    .isInt({ min: 1, max: 60 })
    .withMessage('Recurrence interval must be a positive integer'),
  body('recurrence_end')
    .optional(isOptional)
    .isISO8601()
    .withMessage('Recurrence end must be a valid date'),
  body('recurrence_end_at')
    .optional(isOptional)
    .isISO8601()
    .withMessage('Recurrence end must be a valid date'),
  handleValidationErrors,
];

const COMPLEXITY_LEVELS = ['simple', 'medium', 'complex'];

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
    .optional(isOptional)
    .isString()
    .isLength({ max: 10000 })
    .withMessage('Signature data is too large'),
  body('time_spent_minutes')
    .optional(isOptional)
    .isInt({ min: 0, max: 525600 })
    .withMessage('Time spent must be a non-negative whole number (minutes)'),
  body('complexity_level')
    .optional(isOptional)
    .isIn(COMPLEXITY_LEVELS)
    .withMessage('Complexity must be one of: ' + COMPLEXITY_LEVELS.join(', ')),
  body('parts_replaced')
    .optional(isOptional)
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Parts replaced must be under 2000 characters'),
  body('next_maintenance_due')
    .optional(isOptional)
    .isISO8601()
    .withMessage('Next maintenance due date must be a valid date'),
  body('asset_id').optional(isOptional).isInt({ min: 1 }).withMessage('Asset must be a valid ID'),
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

const incidentIdParamValidation = [
  param('incidentId').isInt({ min: 1 }).withMessage('A valid incident ID is required'),
  handleValidationErrors,
];

const ratingValidation = [
  body('rating')
    .optional({ values: 'null' })
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),
  body('feedback')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Feedback must be 2000 characters or fewer'),
  handleValidationErrors,
];

const commentValidation = [
  body('comment')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Comment is required and must be under 2000 characters'),
  handleValidationErrors,
];

const userCreateValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Username must be 3-100 characters'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email is required'),
  body('password')
    .isLength({ min: 8, max: 255 })
    .withMessage('Password must be at least 8 characters'),
  body('role')
    .optional({ values: 'null' })
    .trim()
    .isIn(USER_ROLES)
    .withMessage('Role must be one of: ' + USER_ROLES.join(', ')),
  handleValidationErrors,
];

const userUpdateValidation = [
  body('username')
    .optional({ values: 'null' })
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Username must be 3-100 characters'),
  body('email')
    .optional({ values: 'null' })
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email is required'),
  body('role')
    .optional({ values: 'null' })
    .trim()
    .isIn(USER_ROLES)
    .withMessage('Role must be one of: ' + USER_ROLES.join(', ')),
  body('password')
    .optional({ values: 'null' })
    .isLength({ min: 8, max: 255 })
    .withMessage('Password must be at least 8 characters'),
  handleValidationErrors,
];

/**
 * Asset payloads wrap writable fields in `user` plus an optional
 * `lifecycle_event` describing the transition being recorded, matching the
 * shape the assets controller expects.
 */
const assetValidation = [
  body('user.asset_identifier').trim().isLength({ min: 1, max: 255 }).withMessage('Asset identifier is required and must be under 255 characters'),
  body('user.asset_type').isLength({ min: 1, max: 100 }).withMessage('Asset type is required'),
  body('user.make_model').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Make/model must be under 255 characters'),
  body('user.serial_number').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Serial number must be under 255 characters'),
  body('user.description').optional(isOptional).trim().isLength({ max: 2000 }).withMessage('Description must be under 2000 characters'),
  body('user.department').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Department must be under 255 characters'),
  body('user.room').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Room must be under 255 characters'),
  body('user.assigned_to').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Assigned to must be under 255 characters'),
  body('user.supplier').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Supplier must be under 255 characters'),
  body('user.purchase_date').optional(isOptional).isISO8601().withMessage('Purchase date must be a valid date'),
  body('user.warranty_start').optional(isOptional).isISO8601().withMessage('Warranty start must be a valid date'),
  body('user.warranty_expiry').optional(isOptional).isISO8601().withMessage('Warranty expiry must be a valid date'),
  body('user.deployed_date').optional(isOptional).isISO8601().withMessage('Deployment date must be a valid date'),
  body('user.end_of_life_date').optional(isOptional).isISO8601().withMessage('End-of-life date must be a valid date'),
  body('user.disposal_date').optional(isOptional).isISO8601().withMessage('Disposal date must be a valid date'),
  body('user.disposal_method').optional(isOptional).trim().isLength({ max: 100 }).withMessage('Disposal method must be under 100 characters'),
  body('user.disposal_reference').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Disposal reference must be under 255 characters'),
  body('user.lifecycle_status').optional(isOptional).isIn(LIFECYCLE_STATUSES).withMessage('Lifecycle status must be one of: ' + LIFECYCLE_STATUSES.join(', ')),
  body('user.condition_rating').optional(isOptional).isIn(['excellent', 'good', 'fair', 'poor', 'critical']).withMessage('Condition rating must be one of: excellent, good, fair, poor, critical'),
  body('user.notes').optional(isOptional).trim().isLength({ max: 5000 }).withMessage('Notes must be under 5000 characters'),
  body('lifecycle_event.event_type').optional(isOptional).isIn(ASSET_EVENT_TYPES).withMessage('Event type must be one of: ' + ASSET_EVENT_TYPES.join(', ')),
  body('lifecycle_event.event_date').optional(isOptional).isISO8601().withMessage('Event date must be a valid date'),
  body('lifecycle_event.description').optional(isOptional).trim().isLength({ max: 2000 }).withMessage('Event description must be under 2000 characters'),
  body('lifecycle_event.performed_by').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Performed by must be under 255 characters'),
  handleValidationErrors,
];

const assetEventValidation = [
  body('event_type').isIn(ASSET_EVENT_TYPES).withMessage('Event type must be one of: ' + ASSET_EVENT_TYPES.join(', ')),
  body('event_date').isISO8601().withMessage('A valid event date is required'),
  body('description').optional(isOptional).trim().isLength({ max: 2000 }).withMessage('Description must be under 2000 characters'),
  body('performed_by').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Performed by must be under 255 characters'),
  handleValidationErrors,
];

const downtimeWindowValidation = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required and must be under 255 characters'),
  body('starts_at').isISO8601().withMessage('A valid start time is required'),
  body('ends_at').isISO8601().withMessage('A valid end time is required'),
  body('department').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Department must be under 255 characters'),
  body('room').optional(isOptional).trim().isLength({ max: 255 }).withMessage('Room must be under 255 characters'),
  body('asset_id').optional(isOptional).isInt({ min: 1 }).withMessage('Asset must be a valid ID'),
  body('reason').optional(isOptional).trim().isLength({ max: 2000 }).withMessage('Reason must be under 2000 characters'),
  body('window_type').optional(isOptional).isIn(DOWNTIME_WINDOW_TYPES).withMessage('Window type must be one of: ' + DOWNTIME_WINDOW_TYPES.join(', ')),
  handleValidationErrors,
];

const analyticsQueryValidation = [
  query('period').optional(isOptional).isIn(ANALYTICS_PERIODS).withMessage('Period must be one of: ' + ANALYTICS_PERIODS.join(', ')),
  query('interval').optional(isOptional).isIn(TREND_INTERVALS).withMessage('Interval must be day or week'),
  query('from').optional(isOptional).isISO8601().withMessage('From must be a valid ISO 8601 date'),
  query('to').optional(isOptional).isISO8601().withMessage('To must be a valid ISO 8601 date'),
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
  incidentIdParamValidation,
  ratingValidation,
  commentValidation,
  assetValidation,
  assetEventValidation,
  downtimeWindowValidation,
  analyticsQueryValidation,
  userCreateValidation,
  userUpdateValidation,
  ASSET_TYPES,
  LIFECYCLE_STATUSES,
  ASSET_EVENT_TYPES,
  DOWNTIME_WINDOW_TYPES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_PRIORITIES,
  RECURRENCE_RULES,
  USER_ROLES,
  COMPLEXITY_LEVELS,
};
