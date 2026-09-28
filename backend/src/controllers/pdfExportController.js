const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { logMaintenanceAudit } = require('../middleware/audit');

const WATERMARK_PATH = path.join(__dirname, '../../frontend/public/Background_watermark/background.jpeg');

function addWatermark(doc) {
  if (fs.existsSync(WATERMARK_PATH)) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const watermarkWidth = 300;
    const watermarkHeight = 300;
    const x = (pageWidth - watermarkWidth) / 2;
    const y = (pageHeight - watermarkHeight) / 2;
    
    doc.save();
    doc.opacity(0.1);
    doc.image(WATERMARK_PATH, x, y, { width: watermarkWidth, height: watermarkHeight });
    doc.restore();
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function exportServiceRecordPDF(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const recordResult = await pool.query(
      `SELECT sr.*, s.date as schedule_date, s.scheduled_at, s.asset_type, s.asset_identifier, s.department, s.room, s.technician, s.priority,
              u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by_user_id = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       WHERE sr.id = $1`,
      [id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }

    const record = recordResult.rows[0];

    const sigResult = await pool.query(
      `SELECT * FROM service_signatures WHERE service_record_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    let signatureData = null;
    if (sigResult.rows.length > 0) {
      const sig = sigResult.rows[0];
      if (sig.signature_data) {
        signatureData = `data:${sig.mime_type};base64,${sig.signature_data.toString('base64')}`;
      }
      record.signer_name = sig.signer_name || record.signer_name;
      record.signer_date = sig.signer_date || record.signer_date;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="service-record-${id}-${Date.now()}.pdf"`);
    
    doc.pipe(res);

    addWatermark(doc);

    doc.fontSize(24).font('Helvetica-Bold').fillColor('#1f2937').text('Lusaka City Council', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(16).font('Helvetica').fillColor('#6b7280').text('IT Maintenance Calendar', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#f97316').text('Service Record Report', { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(1);

    const details = [
      { label: 'Record ID', value: record.id },
      { label: 'Schedule Date', value: formatDate(record.schedule_date) },
      { label: 'Department', value: record.department },
      { label: 'Room', value: record.room },
      { label: 'Asset Type', value: record.asset_type?.replace(/_/g, ' ') },
      { label: 'Asset Identifier', value: record.asset_identifier || '-' },
      { label: 'Technician', value: record.technician },
      { label: 'Priority', value: record.priority },
      { label: 'Work Performed', value: record.work_performed },
      { label: 'Outcome', value: record.outcome || '-' },
      { label: 'Follow-up', value: record.follow_up || '-' },
      { label: 'Signer Name', value: record.signer_name || '-' },
      { label: 'Signer Date', value: formatDate(record.signer_date) },
      { label: 'Created By', value: record.created_by_name || '-' },
      { label: 'Created At', value: formatDateTime(record.created_at) },
      { label: 'Updated At', value: formatDateTime(record.updated_at) },
    ];

    doc.font('Helvetica').fontSize(11);
    details.forEach((item, index) => {
      const y = doc.y;
      doc.fillColor('#6b7280').font('Helvetica').text(`${item.label}:`, 50, y, { width: 180, continued: false });
      doc.fillColor('#1f2937').font('Helvetica').text(item.value, 230, y, { width: doc.page.width - 280 });
      doc.moveDown(0.5);
    });

    if (signatureData) {
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('Digital Signature', { align: 'left' });
      doc.moveDown(0.5);
      
      try {
        const base64Data = signatureData.split(',')[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const sigWidth = 250;
        const sigHeight = 100;
        doc.image(imgBuffer, 50, doc.y, { width: sigWidth, height: sigHeight });
        doc.moveDown(6);
      } catch (e) {
        doc.fontSize(11).fillColor('#6b7280').text('[Signature image could not be rendered]');
      }
      
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#1f2937').text(`Signed by: ${record.signer_name || '-'}`);
      doc.text(`Date: ${formatDate(record.signer_date)}`);
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#9ca3af').text(
      `Generated on ${new Date().toLocaleString('en-GB')} by ${req.user.username} | Lusaka City Council IT Maintenance Calendar`,
      { align: 'center' }
    );
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#9ca3af').text(
      'This document is for official government records retention purposes.',
      { align: 'center' }
    );

    doc.end();

    await logMaintenanceAudit(req, 'EXPORT_SERVICE_PDF', 'service', id, { format: 'pdf' }, userId);
  } catch (error) {
    console.error('Export service record PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}

async function exportCompletionCertificatePDF(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const recordResult = await pool.query(
      `SELECT sr.*, s.date as schedule_date, s.scheduled_at, s.asset_type, s.asset_identifier, s.department, s.room, s.technician, s.priority, s.description as schedule_description,
              u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by_user_id = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       WHERE sr.id = $1`,
      [id]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service record not found' });
    }

    const record = recordResult.rows[0];

    const sigResult = await pool.query(
      `SELECT * FROM service_signatures WHERE service_record_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    let signatureData = null;
    if (sigResult.rows.length > 0) {
      const sig = sigResult.rows[0];
      if (sig.signature_data) {
        signatureData = `data:${sig.mime_type};base64,${sig.signature_data.toString('base64')}`;
      }
      record.signer_name = sig.signer_name || record.signer_name;
      record.signer_date = sig.signer_date || record.signer_date;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'portrait' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="completion-certificate-${id}-${Date.now()}.pdf"`);
    
    doc.pipe(res);

    addWatermark(doc);

    const pageWidth = doc.page.width - 100;
    const centerX = 50 + pageWidth / 2;

    doc.moveDown(2);
    doc.fontSize(18).font('Helvetica').fillColor('#6b7280').text('LUSAKA CITY COUNCIL', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica').fillColor('#6b7280').text('IT Maintenance Division', { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#f97316').lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fontSize(28).font('Helvetica-Bold').fillColor('#1f2937').text('MAINTENANCE COMPLETION', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#f97316').text('CERTIFICATE', { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#f97316').lineWidth(2).stroke();
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica').fillColor('#1f2937').text(
      'This certifies that the following maintenance activity has been successfully completed',
      { align: 'center' }
    );
    doc.moveDown(1.5);

    const certDetails = [
      { label: 'Certificate Number', value: `MCC-${record.id.toString().padStart(6, '0')}` },
      { label: 'Date of Maintenance', value: formatDate(record.schedule_date) },
      { label: 'Department', value: record.department },
      { label: 'Location', value: `${record.room}${record.asset_identifier ? ` (${record.asset_identifier})` : ''}` },
      { label: 'Asset Type', value: record.asset_type?.replace(/_/g, ' ') },
      { label: 'Equipment', value: record.schedule_description || `${record.asset_type?.replace(/_/g, ' ')}` },
      { label: 'Technician', value: record.technician },
      { label: 'Priority', value: record.priority?.toUpperCase() },
      { label: 'Work Performed', value: record.work_performed },
      { label: 'Outcome', value: record.outcome || 'Successfully completed' },
    ];

    const boxTop = doc.y;
    const boxHeight = certDetails.length * 28 + 40;
    
    doc.rect(50, boxTop, pageWidth, boxHeight).strokeColor('#d1d5db').lineWidth(1).stroke();
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11);
    certDetails.forEach((item, index) => {
      const y = boxTop + 20 + index * 28;
      doc.fillColor('#6b7280').font('Helvetica').text(`${item.label}:`, 70, y, { width: 200, continued: false });
      doc.fillColor('#1f2937').font('Helvetica-Bold').text(item.value, 270, y, { width: doc.page.width - 320 });
    });

    doc.y = boxTop + boxHeight + 30;

    if (signatureData) {
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(1);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('Authorized Signature', { align: 'left' });
      doc.moveDown(0.5);
      
      try {
        const base64Data = signatureData.split(',')[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const sigWidth = 250;
        const sigHeight = 100;
        doc.image(imgBuffer, 70, doc.y, { width: sigWidth, height: sigHeight });
        doc.moveDown(6);
      } catch (e) {
        doc.fontSize(11).fillColor('#6b7280').text('[Signature image could not be rendered]');
      }
      
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#1f2937').text(`Signed by: ${record.signer_name || '-'}`);
      doc.text(`Date: ${formatDate(record.signer_date)}`);
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#9ca3af').text(
      `Issued on ${new Date().toLocaleString('en-GB')} | Lusaka City Council IT Maintenance Calendar`,
      { align: 'center' }
    );
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#9ca3af').text(
      'This certificate is an official document for government records retention.',
      { align: 'center' }
    );
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#9ca3af').text(
      'Valid for compliance and audit purposes.',
      { align: 'center' }
    );

    doc.end();

    await logMaintenanceAudit(req, 'EXPORT_CERTIFICATE_PDF', 'service', id, { format: 'pdf', type: 'completion_certificate' }, userId);
  } catch (error) {
    console.error('Export completion certificate PDF error:', error);
    res.status(500).json({ error: 'Failed to generate certificate PDF' });
  }
}

async function exportComplianceReportPDF(req, res) {
  const { start_date, end_date, department, asset_type, status } = req.query;
  const userId = req.user.id;

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (start_date) { conditions.push(`sr.created_at >= $${idx++}`); params.push(start_date); }
    if (end_date) { conditions.push(`sr.created_at <= $${idx++}`); params.push(end_date); }
    if (department) { conditions.push(`s.department = $${idx++}`); params.push(department); }
    if (asset_type) { conditions.push(`s.asset_type = $${idx++}`); params.push(asset_type); }
    if (status) { conditions.push(`sr.outcome = $${idx++}`); params.push(status); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const recordsResult = await pool.query(
      `SELECT sr.*, s.date as schedule_date, s.asset_type, s.asset_identifier, s.department, s.room, s.technician, s.priority,
              u.username as signed_by_name, cr.username as created_by_name
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       LEFT JOIN users u ON sr.signed_by_user_id = u.id
       LEFT JOIN users cr ON sr.created_by = cr.id
       ${whereClause}
       ORDER BY sr.created_at DESC`,
      params
    );

    const records = recordsResult.rows;

    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as total_records,
         COUNT(CASE WHEN sr.outcome = 'completed' THEN 1 END) as completed_count,
         COUNT(CASE WHEN sr.outcome = 'pending' THEN 1 END) as pending_count,
         COUNT(CASE WHEN sr.signature_data IS NOT NULL OR sr.signer_name IS NOT NULL THEN 1 END) as signed_count,
         COUNT(DISTINCT s.department) as departments_count,
         COUNT(DISTINCT s.asset_type) as asset_types_count,
         MIN(sr.created_at) as earliest_record,
         MAX(sr.created_at) as latest_record
       FROM service_records sr
       LEFT JOIN maintenance_schedules s ON sr.schedule_id = s.id
       ${whereClause}`,
      params
    );

    const stats = statsResult.rows[0];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${Date.now()}.pdf"`);
    
    doc.pipe(res);

    addWatermark(doc);

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1f2937').text('LUSAKA CITY COUNCIL', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica').fillColor('#6b7280').text('IT Maintenance Division', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#f97316').lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1f2937').text('COMPLIANCE REPORT', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica').fillColor('#6b7280').text('Government Records Retention', { align: 'center' });
    doc.moveDown(1);

    const reportPeriod = [];
    if (start_date) reportPeriod.push(`From: ${formatDate(start_date)}`);
    if (end_date) reportPeriod.push(`To: ${formatDate(end_date)}`);
    if (department) reportPeriod.push(`Department: ${department}`);
    if (asset_type) reportPeriod.push(`Asset Type: ${asset_type.replace(/_/g, ' ')}`);
    if (reportPeriod.length > 0) {
      doc.fontSize(11).fillColor('#6b7280').text(reportPeriod.join(' | '), { align: 'center' });
      doc.moveDown(1);
    }

    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('Executive Summary', { align: 'left' });
    doc.moveDown(0.5);

    const summaryItems = [
      { label: 'Total Service Records', value: stats.total_records },
      { label: 'Completed Records', value: stats.completed_count },
      { label: 'Pending Records', value: stats.pending_count },
      { label: 'Records with Digital Signatures', value: stats.signed_count },
      { label: 'Departments Covered', value: stats.departments_count },
      { label: 'Asset Types Maintained', value: stats.asset_types_count },
      { label: 'Earliest Record', value: formatDateTime(stats.earliest_record) },
      { label: 'Latest Record', value: formatDateTime(stats.latest_record) },
    ];

    summaryItems.forEach(item => {
      doc.fontSize(11);
      doc.fillColor('#6b7280').font('Helvetica').text(`${item.label}:`, { continued: true });
      doc.fillColor('#1f2937').font('Helvetica-Bold').text(` ${item.value}`);
      doc.moveDown(0.3);
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1f2937').text('Detailed Service Records', { align: 'left' });
    doc.moveDown(0.5);

    if (records.length === 0) {
      doc.fontSize(11).fillColor('#6b7280').text('No records found for the specified criteria.', { align: 'center' });
    } else {
      const colWidths = {
        id: 40,
        date: 70,
        dept: 80,
        asset: 80,
        technician: 70,
        outcome: 70,
        signer: 80,
      };

      const tableTop = doc.y;
      const headers = ['ID', 'Date', 'Department', 'Asset', 'Technician', 'Outcome', 'Signer'];
      const xPositions = [50, 90, 160, 240, 320, 390, 460];

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1f2937');
      headers.forEach((header, i) => {
        doc.text(header, xPositions[i], tableTop, { width: colWidths[Object.keys(colWidths)[i]] || 70, align: 'left' });
      });

      doc.moveTo(50, tableTop + 18).lineTo(doc.page.width - 50, tableTop + 18).strokeColor('#d1d5db').stroke();

      let currentY = tableTop + 22;
      doc.font('Helvetica').fontSize(7).fillColor('#1f2937');

      for (const record of records) {
        if (currentY > doc.page.height - 100) {
          addWatermark(doc);
          doc.addPage();
          currentY = 50;
        }

        const rowData = [
          record.id,
          formatDate(record.schedule_date),
          record.department?.substring(0, 15),
          record.asset_type?.replace(/_/g, ' ')?.substring(0, 15),
          record.technician?.substring(0, 15),
          record.outcome?.substring(0, 15) || '-',
          record.signer_name?.substring(0, 15) || '-',
        ];

        rowData.forEach((val, i) => {
          doc.text(val, xPositions[i], currentY, { width: colWidths[Object.keys(colWidths)[i]] || 70, align: 'left' });
        });

        currentY += 18;
      }
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#9ca3af').text(
      `Report generated on ${new Date().toLocaleString('en-GB')} by ${req.user.username}`,
      { align: 'center' }
    );
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#9ca3af').text(
      'Lusaka City Council IT Maintenance Calendar — Official Government Records',
      { align: 'center' }
    );
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#9ca3af').text(
      'This report is generated for compliance and audit purposes in accordance with government records retention policies.',
      { align: 'center' }
    );

    doc.end();

    await logMaintenanceAudit(req, 'EXPORT_COMPLIANCE_PDF', 'service', null, { 
      format: 'pdf', 
      type: 'compliance_report',
      filters: { start_date, end_date, department, asset_type, status },
      record_count: records.length
    }, userId);
  } catch (error) {
    console.error('Export compliance report PDF error:', error);
    res.status(500).json({ error: 'Failed to generate compliance report PDF' });
  }
}

module.exports = { exportServiceRecordPDF, exportCompletionCertificatePDF, exportComplianceReportPDF };