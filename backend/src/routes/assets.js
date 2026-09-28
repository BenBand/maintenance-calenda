const express = require('express');
const router = express.Router();
const {
  getAssets, getAssetById, createAsset, updateAsset, deleteAsset,
  getAssetEvents, createAssetEvent, updateLifecycleStatus,
  getAssetTypes, createAssetType, getAssetStats,
} = require('../controllers/assetsController');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');
const { idParamValidation, assetValidation, assetEventValidation } = require('../middleware/validate');

router.use(authenticateToken, csrfProtection);

router.get('/types', requirePermission('asset:read'), getAssetTypes);
router.post('/types', requirePermission('asset:write'), createAssetType);
router.get('/stats', requirePermission('asset:read'), getAssetStats);
router.get('/', requirePermission('asset:read'), getAssets);
router.get('/:id', requirePermission('asset:read'), idParamValidation, getAssetById);
router.get('/:id/events', requirePermission('asset:read'), idParamValidation, getAssetEvents);
router.post('/:id/events', requirePermission('asset:write'), idParamValidation, assetEventValidation, createAssetEvent);
router.post('/:id/lifecycle', requirePermission('asset:write'), idParamValidation, updateLifecycleStatus);
router.post('/', requirePermission('asset:write'), assetValidation, createAsset);
router.put('/:id', requirePermission('asset:write'), idParamValidation, assetValidation, updateAsset);
router.delete('/:id', requirePermission('asset:delete'), idParamValidation, deleteAsset);

module.exports = router;
