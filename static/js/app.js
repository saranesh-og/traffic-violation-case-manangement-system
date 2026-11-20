/**
 * Traffic Violation Case Management System (TVCMS)
 * Comprehensive Frontend Application Engine
 */

let allCases = [];
let selectedEvidenceCaseId = null;
let currentInspectedEvidence = null;
let selectedAdjudicationCaseId = null;
let searchDebounceTimer = null;

// Status colors and badges dictionary
const STATUS_BADGE_MAP = {
  'Pending Review': { class: 'badge-warning', icon: 'fa-hourglass-half' },
  'Under Investigation': { class: 'badge-warning', icon: 'fa-magnifying-glass' },
  'Evidence Verified': { class: 'badge-info', icon: 'fa-check-double' },
  'Dispute Filed': { class: 'badge-purple', icon: 'fa-hand' },
  'Hearing Scheduled': { class: 'badge-purple', icon: 'fa-calendar-check' },
  'Upheld / Guilty': { class: 'badge-danger', icon: 'fa-gavel' },
  'Fine Reduced': { class: 'badge-info', icon: 'fa-circle-arrow-down' },
  'Dismissed': { class: 'badge-neutral', icon: 'fa-ban' },
  'Settled / Paid': { class: 'badge-success', icon: 'fa-circle-check' },
  'Closed': { class: 'badge-neutral', icon: 'fa-lock' }
};

const SEVERITY_BADGE_MAP = {
  'Infraction': 'badge-neutral',
  'Minor': 'badge-info',
  'Moderate': 'badge-warning',
  'Severe / Misdemeanor': 'badge-danger'
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initDefaults();
  loadStats();
  loadCases();
  loadAuditLogs();
});

function initDefaults() {
  // Set default datetime to now
  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const violationDateInput = document.getElementById('newViolationDate');
  if (violationDateInput) violationDateInput.value = localIso;

  const todayIso = now.toISOString().slice(0, 10);
  const hearingDateInput = document.getElementById('formHearingDate');
  if (hearingDateInput) hearingDateInput.value = todayIso;

  const appealDate = new Date();
  appealDate.setDate(appealDate.getDate() + 30);
  const appealInput = document.getElementById('formAppealDeadline');
  if (appealInput) appealInput.value = appealDate.toISOString().slice(0, 10);
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-link').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  if (tabId === 'tab-dashboard') {
    loadStats();
  } else if (tabId === 'tab-records') {
    loadCases();
  } else if (tabId === 'tab-evidence') {
    if (!selectedEvidenceCaseId && allCases.length > 0) {
      selectedEvidenceCaseId = allCases[0].id;
    }
    populateEvidenceCaseSelector();
    onEvidenceCaseSelected();
  } else if (tabId === 'tab-adjudication') {
    if (!selectedAdjudicationCaseId && allCases.length > 0) {
      selectedAdjudicationCaseId = allCases[0].id;
    }
    populateAdjudicationCaseSelector();
    onAdjudicationCaseSelected();
  } else if (tabId === 'tab-audit') {
    loadAuditLogs();
  }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.className = `toast show ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-success' : 'fa-triangle-exclamation text-danger'}"></i> ${message}`;

  setTimeout(() => {
    toast.className = 'toast';
  }, 4000);
}

// ==========================================
// DASHBOARD & STATS API
// ==========================================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();

    // Top Navigation Pills
    document.getElementById('pillActiveCases').textContent = data.total_cases;
    document.getElementById('pillPendingReview').textContent = data.pending_cases;
    document.getElementById('pillSettled').textContent = data.resolved_cases;
    document.getElementById('pillCollected').textContent = `$${data.total_fines_collected.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    // Metric Cards
    document.getElementById('statTotalCases').textContent = data.total_cases;
    document.getElementById('statPendingReview').textContent = data.pending_cases;
    document.getElementById('statVerified').textContent = data.verified_cases;
    document.getElementById('statHearings').textContent = data.hearing_cases;
    document.getElementById('statResolved').textContent = data.resolved_cases;
    document.getElementById('statFinesCollected').textContent = `$${data.total_fines_collected.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    document.getElementById('statFinesLevied').textContent = `$${data.total_fines_levied.toLocaleString(undefined, {maximumFractionDigits: 0})}`;

    // Render Violation Breakdown Bars
    renderViolationBreakdown(data.violations_breakdown || [], data.total_cases);

    // Render Status Pipeline Bars
    renderStatusPipeline(data.status_breakdown || [], data.total_cases);
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

function renderViolationBreakdown(breakdown, total) {
  const container = document.getElementById('violationBreakdownList');
  if (!container) return;

  if (breakdown.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm">No violation records logged.</div>';
    return;
  }

  const colors = ['#38bdf8', '#818cf8', '#a855f7', '#f43f5e', '#fb923c', '#10b981'];

  container.innerHTML = breakdown.map((item, idx) => {
    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
    const color = colors[idx % colors.length];
    return `
      <div class="breakdown-row">
        <div class="row-labels">
          <span class="text-white">${escapeHtml(item.type)}</span>
          <span class="text-secondary font-mono">${item.count} cases (${pct}%)</span>
        </div>
        <div class="row-bar-track">
          <div class="row-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderStatusPipeline(statusList, total) {
  const container = document.getElementById('statusPipelineList');
  if (!container) return;

  if (statusList.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm">No pipeline records found.</div>';
    return;
  }

  container.innerHTML = statusList.map(item => {
    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
    let color = '#94a3b8';
    if (item.status.includes('Pending') || item.status.includes('Investigation')) color = '#f59e0b';
    else if (item.status.includes('Verified')) color = '#38bdf8';
    else if (item.status.includes('Hearing') || item.status.includes('Dispute')) color = '#a855f7';
    else if (item.status.includes('Guilty') || item.status.includes('Upheld')) color = '#ef4444';
    else if (item.status.includes('Reduced') || item.status.includes('Paid')) color = '#22c55e';

    return `
      <div class="pipeline-row">
        <div class="row-labels">
          <span class="text-white">${escapeHtml(item.status)}</span>
          <span class="text-secondary font-mono">${item.count} (${pct}%)</span>
        </div>
        <div class="row-bar-track">
          <div class="row-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// CASES API & TABLE
// ==========================================
async function loadCases() {
  const search = document.getElementById('recordSearchInput')?.value.trim() || '';
  const status = document.getElementById('filterStatus')?.value || 'ALL';
  const severity = document.getElementById('filterSeverity')?.value || 'ALL';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status !== 'ALL') params.append('status', status);
  if (severity !== 'ALL') params.append('severity', severity);

  try {
    const res = await fetch(`/api/cases?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch cases');
    const cases = await res.json();
    allCases = cases;

    // Update counts
    const tabCount = document.getElementById('recordsTabCount');
    if (tabCount) tabCount.textContent = cases.length;

    const countText = document.getElementById('recordsCountText');
    if (countText) countText.textContent = `Showing ${cases.length} traffic citation records`;

    // Render Records Table
    renderCasesTable(cases);

    // Render Dashboard Recent Table
    renderDashboardRecentTable(cases.slice(0, 5));

    // Populate selectors in other tabs if empty
    populateEvidenceCaseSelector();
    populateAdjudicationCaseSelector();
  } catch (err) {
    console.error('Error fetching cases:', err);
    const tbody = document.getElementById('casesTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4">Error loading records: ${err.message}</td></tr>`;
    }
  }
}

function renderCasesTable(cases) {
  const tbody = document.getElementById('casesTableBody');
  if (!tbody) return;

  if (cases.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4 text-muted">
          <i class="fa-solid fa-folder-open fa-2x mb-2"></i><br>
          No traffic violation records found matching your filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = cases.map(c => {
    const statusMeta = STATUS_BADGE_MAP[c.status] || { class: 'badge-neutral', icon: 'fa-circle-info' };
    const severityClass = SEVERITY_BADGE_MAP[c.severity] || 'badge-neutral';
    const violationDateFormatted = formatDateTime(c.violation_date);

    let speedBadge = '<span class="text-muted">--</span>';
    if (c.speed_recorded && c.speed_limit) {
      const over = c.speed_recorded - c.speed_limit;
      speedBadge = `<span class="badge ${over >= 20 ? 'badge-danger' : 'badge-warning'} font-mono">${c.speed_recorded} / ${c.speed_limit} mph (+${over})</span>`;
    }

    return `
      <tr>
        <td>
          <a href="javascript:void(0)" onclick="openCase360Modal(${c.id})" class="citation-tag">
            <i class="fa-solid fa-file-lines"></i> ${escapeHtml(c.citation_number)}
          </a>
        </td>
        <td>
          <span class="plate-tag">${escapeHtml(c.license_plate)}</span>
          <div class="text-xs text-secondary mt-1">${escapeHtml(c.vehicle_state || 'CA')} &bull; ${escapeHtml(c.vehicle_make || '')} ${escapeHtml(c.vehicle_model || '')}</div>
        </td>
        <td>
          <div class="font-bold text-white">${escapeHtml(c.driver_name)}</div>
          <div class="text-xs text-secondary font-mono">DL: ${escapeHtml(c.driver_license)}</div>
        </td>
        <td>
          <div class="font-bold text-white">${escapeHtml(c.violation_type)}</div>
          <div class="text-xs font-mono text-primary">${escapeHtml(c.violation_code)} &bull; <span class="badge ${severityClass} text-xs py-0">${escapeHtml(c.severity)}</span></div>
        </td>
        <td>${speedBadge}</td>
        <td>
          <div class="text-xs font-mono text-white">${violationDateFormatted}</div>
          <div class="text-xs text-secondary text-truncate" style="max-width: 160px;" title="${escapeHtml(c.location)}">
            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(c.location)}
          </div>
        </td>
        <td>
          <div class="font-mono font-bold text-danger">$${c.fine_amount.toFixed(2)}</div>
          <div class="text-xs text-secondary">${c.demerit_points} Demerit pt(s)</div>
        </td>
        <td>
          <span class="badge ${c.evidence_count > 0 ? 'badge-info' : 'badge-neutral'} cursor-pointer" onclick="jumpToEvidence(${c.id})">
            <i class="fa-solid fa-camera"></i> ${c.evidence_count} file(s)
          </span>
        </td>
        <td>
          <span class="badge ${statusMeta.class}">
            <i class="fa-solid ${statusMeta.icon}"></i> ${escapeHtml(c.status)}
          </span>
          ${c.payment_status ? `<div class="text-xs text-success mt-1"><i class="fa-solid fa-credit-card"></i> ${escapeHtml(c.payment_status)}</div>` : ''}
        </td>
        <td>
          <div class="d-flex align-center gap-1">
            <button class="btn btn-xs btn-secondary" onclick="jumpToEvidence(${c.id})" title="Review Evidence Files">
              <i class="fa-solid fa-camera-retro"></i>
            </button>
            <button class="btn btn-xs btn-secondary" onclick="jumpToAdjudication(${c.id})" title="Adjudicate / Hearing Desk">
              <i class="fa-solid fa-gavel"></i>
            </button>
            <button class="btn btn-xs btn-secondary" onclick="openCase360Modal(${c.id})" title="View Complete 360 Dossier">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderDashboardRecentTable(cases) {
  const tbody = document.getElementById('dashboardRecentTableBody');
  if (!tbody) return;

  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3 text-muted">No citations on file.</td></tr>';
    return;
  }

  tbody.innerHTML = cases.map(c => {
    const statusMeta = STATUS_BADGE_MAP[c.status] || { class: 'badge-neutral', icon: 'fa-circle-info' };
    return `
      <tr>
        <td><span class="citation-tag font-bold">${escapeHtml(c.citation_number)}</span></td>
        <td>
          <span class="plate-tag">${escapeHtml(c.license_plate)}</span>
          <span class="text-xs text-secondary ms-1">${escapeHtml(c.vehicle_make || '')}</span>
        </td>
        <td class="font-bold text-white">${escapeHtml(c.driver_name)}</td>
        <td>
          <div class="text-white">${escapeHtml(c.violation_type)}</div>
          <div class="text-xs font-mono text-primary">${escapeHtml(c.violation_code)}</div>
        </td>
        <td>
          <div class="text-xs font-mono">${formatDateTime(c.violation_date)}</div>
          <div class="text-xs text-secondary">${escapeHtml(c.location)}</div>
        </td>
        <td class="font-mono text-danger font-bold">$${c.fine_amount.toFixed(2)}</td>
        <td>
          <span class="badge ${statusMeta.class}">
            <i class="fa-solid ${statusMeta.icon}"></i> ${escapeHtml(c.status)}
          </span>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="jumpToEvidence(${c.id})">
            Review <i class="fa-solid fa-arrow-right"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleSearchInput() {
  const val = document.getElementById('recordSearchInput').value;
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadCases();
  }, 300);
}

function clearSearch() {
  document.getElementById('recordSearchInput').value = '';
  document.getElementById('searchClearBtn').style.display = 'none';
  loadCases();
}

// ==========================================
// NEW CITATION MODAL & ACTIONS
// ==========================================
function openNewCitationModal() {
  initDefaults();
  const modal = document.getElementById('newCitationModal');
  if (modal) modal.classList.add('open');
}

function applyViolationPreset() {
  const select = document.getElementById('newViolationPreset');
  const val = select.value;
  if (!val || val === 'Custom') return;

  const parts = val.split('|');
  if (parts.length >= 5) {
    document.getElementById('newViolationCode').value = parts[1];
    document.getElementById('newFineAmount').value = parseFloat(parts[2]).toFixed(2);
    document.getElementById('newDemeritPoints').value = parseInt(parts[3]);
    document.getElementById('newSeverity').value = parts[4];
  }
}

async function submitNewCitation() {
  const payload = {
    citation_number: document.getElementById('newCitationNum').value.trim() || undefined,
    license_plate: document.getElementById('newPlate').value.trim().toUpperCase(),
    vehicle_state: document.getElementById('newState').value,
    vehicle_make: document.getElementById('newMakeModel').value.split(' ')[0] || '',
    vehicle_model: document.getElementById('newMakeModel').value.split(' ').slice(1).join(' ') || '',
    vehicle_color: document.getElementById('newColor').value.trim(),
    driver_name: document.getElementById('newDriverName').value.trim(),
    driver_license: document.getElementById('newDriverLicense').value.trim().toUpperCase(),
    driver_phone: document.getElementById('newDriverPhone').value.trim(),
    driver_email: document.getElementById('newDriverEmail').value.trim(),
    violation_type: document.getElementById('newViolationPreset').value.split('|')[0] || 'Traffic Infraction',
    violation_code: document.getElementById('newViolationCode').value.trim(),
    violation_date: document.getElementById('newViolationDate').value,
    location: document.getElementById('newLocation').value.trim(),
    speed_recorded: document.getElementById('newSpeedRecorded').value || null,
    speed_limit: document.getElementById('newSpeedLimit').value || null,
    severity: document.getElementById('newSeverity').value,
    officer_name: document.getElementById('newOfficerName').value.trim(),
    officer_badge: document.getElementById('newOfficerBadge').value.trim(),
    department: document.getElementById('newDepartment').value.trim(),
    fine_amount: parseFloat(document.getElementById('newFineAmount').value),
    demerit_points: parseInt(document.getElementById('newDemeritPoints').value) || 0,
    status: document.getElementById('newStatus').value,
    notes: document.getElementById('newNotes').value.trim()
  };

  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to issue citation');
    }

    const created = await res.json();
    closeModal('newCitationModal');
    showToast(`Citation ${created.citation_number} registered successfully!`, 'success');
    
    // Refresh records and statistics
    loadStats();
    loadCases();
    loadAuditLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// EVIDENCE REVIEW DESK
// ==========================================
function jumpToEvidence(caseId) {
  selectedEvidenceCaseId = caseId;
  switchTab('tab-evidence');
}

function populateEvidenceCaseSelector() {
  const selector = document.getElementById('evidenceCaseSelect');
  if (!selector) return;

  selector.innerHTML = allCases.map(c => `
    <option value="${c.id}" ${c.id == selectedEvidenceCaseId ? 'selected' : ''}>
      ${c.citation_number} - ${c.license_plate} (${c.driver_name})
    </option>
  `).join('');
}

async function onEvidenceCaseSelected() {
  const selector = document.getElementById('evidenceCaseSelect');
  if (!selector) return;

  const caseId = selector.value || selectedEvidenceCaseId;
  if (!caseId) return;

  selectedEvidenceCaseId = caseId;

  try {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) throw new Error('Failed to load case evidence');
    const caseData = await res.json();

    const countBadge = document.getElementById('evidenceCountBadge');
    if (countBadge) countBadge.textContent = (caseData.evidence || []).length;

    renderEvidenceList(caseData.evidence || [], caseData);
  } catch (err) {
    console.error('Error in onEvidenceCaseSelected:', err);
  }
}

function renderEvidenceList(evidenceList, caseData) {
  const container = document.getElementById('evidenceItemsList');
  if (!container) return;

  if (evidenceList.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        <i class="fa-solid fa-camera fa-2x mb-2"></i><br>
        No evidence items attached to this citation yet.<br>
        <button class="btn btn-xs btn-primary mt-2" onclick="openAddEvidenceModal()">
          <i class="fa-solid fa-plus"></i> Attach First Item
        </button>
      </div>
    `;
    resetEvidenceViewer(caseData);
    return;
  }

  container.innerHTML = evidenceList.map((ev, idx) => {
    const isSelected = currentInspectedEvidence && currentInspectedEvidence.id === ev.id;
    let badgeClass = 'badge-neutral';
    if (ev.review_status === 'Verified / Valid') badgeClass = 'badge-success';
    else if (ev.review_status === 'Pending') badgeClass = 'badge-warning';
    else if (ev.review_status === 'Inconclusive') badgeClass = 'badge-purple';
    else if (ev.review_status.includes('Rejected')) badgeClass = 'badge-danger';

    return `
      <div class="evidence-item-card ${isSelected ? 'selected' : ''}" onclick="inspectEvidenceItem(${ev.id})">
        <div class="ev-header">
          <span class="badge ${badgeClass} text-xs py-0">${escapeHtml(ev.review_status)}</span>
          <span class="font-mono text-xs text-secondary">${escapeHtml(ev.evidence_type)}</span>
        </div>
        <div class="ev-title">${escapeHtml(ev.title)}</div>
        <div class="ev-meta">
          <span><i class="fa-solid fa-fingerprint text-primary"></i> ${ev.file_hash ? ev.file_hash.slice(0, 10) + '...' : 'Unsigned'}</span>
          <span>&bull;</span>
          <span>${ev.media_type.toUpperCase()}</span>
        </div>
      </div>
    `;
  }).join('');

  // If no item inspected yet, select the first one
  if (!currentInspectedEvidence || !evidenceList.some(e => e.id === currentInspectedEvidence.id)) {
    inspectEvidenceItem(evidenceList[0].id);
  }
}

async function inspectEvidenceItem(evidenceId) {
  if (!selectedEvidenceCaseId) return;

  try {
    const res = await fetch(`/api/cases/${selectedEvidenceCaseId}`);
    if (!res.ok) throw new Error('Failed to load evidence detail');
    const caseData = await res.json();
    const item = (caseData.evidence || []).find(e => e.id === evidenceId);
    if (!item) return;

    currentInspectedEvidence = item;

    // Update active highlight in list
    document.querySelectorAll('.evidence-item-card').forEach((card, idx) => {
      card.classList.toggle('selected', caseData.evidence[idx]?.id === item.id);
    });

    // Populate Viewer Header
    document.getElementById('viewerBadgeType').textContent = `${item.evidence_type} (FILE #${item.id})`;
    document.getElementById('viewerTitle').textContent = item.title;
    document.getElementById('viewerMeta').textContent = `Citation: ${caseData.citation_number} | Plate: ${caseData.license_plate} | Offense: ${caseData.violation_type}`;

    // Render Media Viewport
    const viewport = document.getElementById('viewerMediaViewport');
    if (item.media_type === 'video' && item.file_path.endsWith('.mp4')) {
      viewport.innerHTML = `
        <video controls autoplay loop style="max-width:100%; max-height:480px; border-radius:4px;">
          <source src="${item.file_path}" type="video/mp4">
          Your browser does not support video tag.
        </video>
      `;
    } else {
      viewport.innerHTML = `
        <img src="${item.file_path}" alt="${escapeHtml(item.title)}" id="viewerActiveImg">
      `;
    }

    // Populate Inspector Drawer
    const drawer = document.getElementById('evidenceInspectorDrawer');
    drawer.style.display = 'block';

    document.getElementById('viewerFileHash').textContent = item.file_hash || 'SHA256: NOT COMPUTED';
    document.getElementById('viewerDeviceSerial').textContent = item.device_serial || 'N/A';
    document.getElementById('viewerCapturedAt').textContent = item.captured_at || 'N/A';
    document.getElementById('viewerCapturedBy').textContent = item.captured_by || 'Enforcement System';

    // Populate Review Controls
    document.getElementById('evalReviewStatus').value = item.review_status || 'Verified / Valid';
    document.getElementById('evalStrength').value = item.evidentiary_strength || 'Conclusive';
    if (item.reviewed_by) document.getElementById('evalAnalystName').value = item.reviewed_by;
    document.getElementById('evalNotes').value = item.analyst_notes || '';
    document.getElementById('reviewSaveStatus').textContent = '';
  } catch (err) {
    console.error('Error inspecting evidence:', err);
  }
}

function resetEvidenceViewer(caseData) {
  currentInspectedEvidence = null;
  document.getElementById('viewerBadgeType').textContent = 'EVIDENCE INSPECTION';
  document.getElementById('viewerTitle').textContent = 'No evidence files selected';
  document.getElementById('viewerMeta').textContent = `Citation: ${caseData.citation_number} (${caseData.license_plate})`;
  document.getElementById('viewerMediaViewport').innerHTML = `
    <div class="empty-viewport-placeholder">
      <i class="fa-solid fa-camera-retro fa-3x"></i>
      <p>No evidence items attached. Click "Add Evidence" above to attach speed camera images, dashcam clips, or calibration certificates.</p>
    </div>
  `;
  document.getElementById('evidenceInspectorDrawer').style.display = 'none';
}

async function submitEvidenceReview() {
  if (!currentInspectedEvidence) return;

  const payload = {
    review_status: document.getElementById('evalReviewStatus').value,
    evidentiary_strength: document.getElementById('evalStrength').value,
    reviewed_by: document.getElementById('evalAnalystName').value.trim() || 'Senior Evidence Analyst',
    analyst_notes: document.getElementById('evalNotes').value.trim()
  };

  try {
    const res = await fetch(`/api/evidence/${currentInspectedEvidence.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to update evidence review status');
    const updated = await res.json();
    currentInspectedEvidence = updated;

    const statusIndicator = document.getElementById('reviewSaveStatus');
    statusIndicator.innerHTML = '<i class="fa-solid fa-check"></i> Admissibility review recorded!';
    setTimeout(() => { statusIndicator.textContent = ''; }, 3000);

    showToast('Evidence evaluation logged and signed successfully!', 'success');

    // Refresh list and audit trail
    onEvidenceCaseSelected();
    loadAuditLogs();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAddEvidenceModal() {
  if (!selectedEvidenceCaseId && allCases.length > 0) {
    selectedEvidenceCaseId = allCases[0].id;
  }
  const targetCase = allCases.find(c => c.id == selectedEvidenceCaseId);
  if (!targetCase) {
    showToast('Please select a case first.', 'error');
    return;
  }

  document.getElementById('evidenceTargetCaseId').value = targetCase.id;
  document.getElementById('evidenceTargetCitation').value = `${targetCase.citation_number} - ${targetCase.license_plate} (${targetCase.driver_name})`;
  document.getElementById('evidenceTitle').value = '';
  document.getElementById('evidenceDescription').value = '';
  document.getElementById('evidenceFileInput').value = '';
  document.getElementById('evidencePresetAsset').value = '';

  const modal = document.getElementById('addEvidenceModal');
  if (modal) modal.classList.add('open');
}

function onPresetAssetSelected() {
  const val = document.getElementById('evidencePresetAsset').value;
  if (!val) return;
  const parts = val.split('|');
  const filePath = parts[0];

  // Auto-fill title based on preset
  if (filePath.includes('speed')) {
    document.getElementById('evidenceTitle').value = 'Automated Highway Gantry Speed Telemetry';
    document.getElementById('evidenceType').value = 'Speed Camera Photo';
    document.getElementById('evidenceDevice').value = 'STALKER-DSR-8819';
  } else if (filePath.includes('redlight')) {
    document.getElementById('evidenceTitle').value = 'Intersection Stop Bar Breach Telemetry (+0.82s)';
    document.getElementById('evidenceType').value = 'Red Light Camera Photo';
    document.getElementById('evidenceDevice').value = 'REDFLEX-SF04';
  } else if (filePath.includes('radar_cert')) {
    document.getElementById('evidenceTitle').value = 'NIST Metrology Radar Calibration Certificate';
    document.getElementById('evidenceType').value = 'Radar Calibration Log';
    document.getElementById('evidenceDevice').value = 'METROLOGY-LAB-99';
  } else if (filePath.includes('dashcam_sim')) {
    document.getElementById('evidenceTitle').value = 'Intersection Trajectory Sensor Simulation';
    document.getElementById('evidenceType').value = 'Dashcam Video Simulation';
    document.getElementById('evidenceDevice').value = 'SENSOR-ARRAY-SF04';
  } else if (filePath.includes('reckless')) {
    document.getElementById('evidenceTitle').value = 'Patrol Cruiser 704 In-Car Telemetry & Chase Video';
    document.getElementById('evidenceType').value = 'Dashcam Video Simulation';
    document.getElementById('evidenceDevice').value = 'PATROL-CAM-704';
  } else if (filePath.includes('schoolzone')) {
    document.getElementById('evidenceTitle').value = 'Active School Zone Flasher Telemetry Image';
    document.getElementById('evidenceType').value = 'Speed Camera Photo';
    document.getElementById('evidenceDevice').value = 'TRUSPEED-09';
  } else if (filePath.includes('obscured')) {
    document.getElementById('evidenceTitle').value = 'Regulatory Sign Foliage Obstruction Defense Photo';
    document.getElementById('evidenceType').value = 'Scene Photo';
    document.getElementById('evidenceDevice').value = 'FIELD-INSPECTION-CAM';
  }
}

async function submitNewEvidence() {
  const caseId = document.getElementById('evidenceTargetCaseId').value;
  const fileInput = document.getElementById('evidenceFileInput');
  const presetAsset = document.getElementById('evidencePresetAsset').value;

  const title = document.getElementById('evidenceTitle').value.trim();
  const evidenceType = document.getElementById('evidenceType').value;
  const deviceSerial = document.getElementById('evidenceDevice').value.trim();
  const capturedBy = document.getElementById('evidenceCapturedBy').value.trim();
  const evidentiaryStrength = document.getElementById('evidenceInitialStrength').value;
  const description = document.getElementById('evidenceDescription').value.trim();

  try {
    let res;
    if (fileInput.files.length > 0) {
      // Multipart upload
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('title', title);
      formData.append('evidence_type', evidenceType);
      formData.append('device_serial', deviceSerial);
      formData.append('captured_by', capturedBy);
      formData.append('evidentiary_strength', evidentiaryStrength);
      formData.append('description', description);

      res = await fetch(`/api/cases/${caseId}/evidence`, {
        method: 'POST',
        body: formData
      });
    } else {
      // Preset asset simulation
      const filePath = presetAsset ? presetAsset.split('|')[0] : '/static/assets/evidence_speed_7xyz982.svg';
      const mediaType = presetAsset ? presetAsset.split('|')[1] : 'image';

      const payload = {
        title,
        evidence_type: evidenceType,
        device_serial: deviceSerial,
        captured_by: capturedBy,
        evidentiary_strength: evidentiaryStrength,
        description,
        file_path: filePath,
        media_type: mediaType
      };

      res = await fetch(`/api/cases/${caseId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to attach evidence');
    }

    const created = await res.json();
    closeModal('addEvidenceModal');
    showToast(`Attached evidence "${created.title}" with verified SHA-256 integrity hash!`, 'success');

    // Refresh evidence viewer and case records
    onEvidenceCaseSelected();
    loadCases();
    loadAuditLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openFullscreenEvidence() {
  const img = document.getElementById('viewerActiveImg');
  if (!img) return;
  if (img.requestFullscreen) {
    img.requestFullscreen();
  } else if (img.webkitRequestFullscreen) {
    img.webkitRequestFullscreen();
  }
}

// ==========================================
// CASE ADJUDICATION & OUTCOMES
// ==========================================
function jumpToAdjudication(caseId) {
  selectedAdjudicationCaseId = caseId;
  switchTab('tab-adjudication');
}

function populateAdjudicationCaseSelector() {
  const selector = document.getElementById('adjudicationCaseSelect');
  if (!selector) return;

  selector.innerHTML = allCases.map(c => `
    <option value="${c.id}" ${c.id == selectedAdjudicationCaseId ? 'selected' : ''}>
      ${c.citation_number} - ${c.license_plate} | ${c.driver_name} - ${c.violation_type} [Status: ${c.status}]
    </option>
  `).join('');
}

async function onAdjudicationCaseSelected() {
  const selector = document.getElementById('adjudicationCaseSelect');
  if (!selector) return;

  const caseId = selector.value || selectedAdjudicationCaseId;
  if (!caseId) return;

  selectedAdjudicationCaseId = caseId;

  try {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) throw new Error('Failed to load case for adjudication');
    const caseData = await res.json();

    // Fill Summary Dossier
    document.getElementById('docketCitationNumber').textContent = caseData.citation_number;
    document.getElementById('docketDriverName').textContent = caseData.driver_name;
    document.getElementById('docketDriverLicense').textContent = caseData.driver_license;
    document.getElementById('docketPlate').textContent = `${caseData.license_plate} (${caseData.vehicle_state || 'CA'})`;
    document.getElementById('docketVehicle').textContent = `${caseData.vehicle_color || ''} ${caseData.vehicle_make || ''} ${caseData.vehicle_model || ''}`.trim() || 'N/A';
    document.getElementById('docketViolation').textContent = caseData.violation_type;
    document.getElementById('docketCode').textContent = caseData.violation_code;
    document.getElementById('docketLocation').textContent = caseData.location;
    document.getElementById('docketDate').textContent = formatDateTime(caseData.violation_date);
    document.getElementById('docketOfficer').textContent = `${caseData.officer_name} (${caseData.officer_badge})`;
    document.getElementById('docketFine').textContent = `$${caseData.fine_amount.toFixed(2)}`;

    // Populate Evidence Bullet List for Magistrate
    const evidenceList = caseData.evidence || [];
    const evContainer = document.getElementById('docketEvidenceSummaryList');
    if (evidenceList.length === 0) {
      evContainer.innerHTML = '<li class="text-muted">No evidence attached to record.</li>';
    } else {
      evContainer.innerHTML = evidenceList.map(ev => `
        <li>
          <span><strong>${escapeHtml(ev.evidence_type)}:</strong> ${escapeHtml(ev.title)}</span>
          <span class="badge ${ev.review_status === 'Verified / Valid' ? 'badge-success' : 'badge-warning'} text-xs">${escapeHtml(ev.evidentiary_strength)}</span>
        </li>
      `).join('');
    }

    // Populate Adjudication Form (Existing Outcome or Defaults)
    const outcome = caseData.outcome;
    const statusBadge = document.getElementById('adjudicationStatusBadge');

    if (outcome) {
      statusBadge.textContent = 'Adjudicated Ruling on File';
      statusBadge.className = 'badge badge-success';

      document.getElementById('formAdjudicationType').value = outcome.adjudication_type || 'Administrative Review';
      document.getElementById('formVerdict').value = outcome.verdict || 'Citation Upheld (Guilty)';
      document.getElementById('formAdjudicatorName').value = outcome.adjudicator_name || 'Magistrate Linda Morales';
      document.getElementById('formHearingDate').value = outcome.hearing_date || new Date().toISOString().slice(0, 10);
      document.getElementById('formOriginalFine').value = outcome.original_fine.toFixed(2);
      document.getElementById('formAdjustedFine').value = outcome.adjusted_fine.toFixed(2);
      document.getElementById('formPenaltyPoints').value = outcome.penalty_points_assessed;
      document.getElementById('formPaymentStatus').value = outcome.payment_status || 'Pending';
      document.getElementById('formPaymentReference').value = outcome.payment_reference || '';
      document.getElementById('formCourtFindings').value = outcome.court_findings || '';
      document.getElementById('formAppealDeadline').value = outcome.appeal_deadline || '';
      document.getElementById('formAppealStatus').value = outcome.appeal_status || 'Not Filed';
    } else {
      statusBadge.textContent = 'Pending Hearing / Decision';
      statusBadge.className = 'badge badge-warning';

      document.getElementById('formAdjudicationType').value = 'Administrative Review';
      document.getElementById('formVerdict').value = 'Citation Upheld (Guilty)';
      document.getElementById('formHearingDate').value = new Date().toISOString().slice(0, 10);
      document.getElementById('formOriginalFine').value = caseData.fine_amount.toFixed(2);
      document.getElementById('formAdjustedFine').value = caseData.fine_amount.toFixed(2);
      document.getElementById('formPenaltyPoints').value = caseData.demerit_points || 0;
      document.getElementById('formPaymentStatus').value = 'Pending';
      document.getElementById('formPaymentReference').value = '';
      document.getElementById('formCourtFindings').value = `Upon examination of citation records, photographic/sensor evidence, and statutory criteria under ${caseData.violation_code}, the violation is established. Penalties assessed according to standard municipal schedule.`;
    }
  } catch (err) {
    console.error('Error in onAdjudicationCaseSelected:', err);
  }
}

function onVerdictChanged() {
  const verdict = document.getElementById('formVerdict').value;
  const originalFine = parseFloat(document.getElementById('formOriginalFine').value) || 0;
  const adjustedFineInput = document.getElementById('formAdjustedFine');
  const penaltyPointsInput = document.getElementById('formPenaltyPoints');
  const paymentStatusInput = document.getElementById('formPaymentStatus');

  if (verdict.includes('Dismissed') || verdict.includes('Acquitted')) {
    adjustedFineInput.value = '0.00';
    penaltyPointsInput.value = '0';
    paymentStatusInput.value = 'Waived';
    document.getElementById('formCourtFindings').value = 'Case dismissed after evidentiary review revealed regulatory, procedural, or technical defects. Fine and demerit points waived in their entirety.';
  } else if (verdict.includes('Reduced')) {
    adjustedFineInput.value = (originalFine * 0.5).toFixed(2);
    penaltyPointsInput.value = '0';
    paymentStatusInput.value = 'Pending';
    document.getElementById('formCourtFindings').value = 'Adjudicator exercises administrative discretion to reduce standard fine by 50% due to mitigating circumstances and driver cooperation. Demerit points mitigated upon proof of payment.';
  } else if (verdict.includes('Driver Improvement')) {
    adjustedFineInput.value = (originalFine * 0.75).toFixed(2);
    penaltyPointsInput.value = '0';
    paymentStatusInput.value = 'Pending';
    document.getElementById('formCourtFindings').value = 'Driver assigned to certified Traffic Safety School. Upon timely completion and remittance of administrative fee, no demerit points shall be reported to DMV.';
  } else {
    adjustedFineInput.value = originalFine.toFixed(2);
  }
}

async function saveCaseOutcome() {
  if (!selectedAdjudicationCaseId) return;

  const payload = {
    adjudication_type: document.getElementById('formAdjudicationType').value,
    verdict: document.getElementById('formVerdict').value,
    adjudicator_name: document.getElementById('formAdjudicatorName').value.trim(),
    hearing_date: document.getElementById('formHearingDate').value,
    original_fine: parseFloat(document.getElementById('formOriginalFine').value),
    adjusted_fine: parseFloat(document.getElementById('formAdjustedFine').value),
    penalty_points_assessed: parseInt(document.getElementById('formPenaltyPoints').value) || 0,
    payment_status: document.getElementById('formPaymentStatus').value,
    payment_reference: document.getElementById('formPaymentReference').value.trim(),
    court_findings: document.getElementById('formCourtFindings').value.trim(),
    appeal_deadline: document.getElementById('formAppealDeadline').value,
    appeal_status: document.getElementById('formAppealStatus').value
  };

  try {
    const res = await fetch(`/api/cases/${selectedAdjudicationCaseId}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to formalize outcome');
    }

    showToast(`Adjudication disposition formalized: "${payload.verdict}"!`, 'success');

    // Refresh records and statistics
    loadStats();
    loadCases();
    loadAuditLogs();
    onAdjudicationCaseSelected();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// PRINTABLE OFFICIAL DISPOSITION SHEET
// ==========================================
async function openPrintDispositionModal() {
  if (!selectedAdjudicationCaseId) return;

  try {
    const res = await fetch(`/api/cases/${selectedAdjudicationCaseId}`);
    if (!res.ok) throw new Error('Failed to load case data');
    const caseData = await res.json();
    const outcome = caseData.outcome || {
      adjudication_type: 'Administrative Review',
      verdict: 'Pending Final Disposition',
      adjudicator_name: 'Hearing Officer',
      hearing_date: new Date().toISOString().slice(0, 10),
      adjusted_fine: caseData.fine_amount,
      penalty_points_assessed: caseData.demerit_points,
      payment_status: 'Pending',
      payment_reference: 'N/A',
      court_findings: 'Case currently in active hearing docket.',
      appeal_deadline: '30 days from disposition'
    };

    const container = document.getElementById('printSheetBody');
    container.innerHTML = `
      <div class="court-sheet-header">
        <h2>MUNICIPAL TRAFFIC ADJUDICATION BUREAU</h2>
        <h3>OFFICIAL CITATION DISPOSITION &amp; JUDICIAL RECORD</h3>
        <p style="font-size: 0.85rem; margin-top: 0.5rem; color: #475569;">
          DEPARTMENT OF MOTOR VEHICLES REPORTABLE DOCUMENT &bull; JURISDICTION CODE #4109
        </p>
      </div>

      <div class="court-grid">
        <div class="court-section">
          <strong>I. CITATION &amp; VEHICLE DATA</strong><br>
          Citation Number: <strong>${escapeHtml(caseData.citation_number)}</strong><br>
          License Plate: <strong>${escapeHtml(caseData.license_plate)} (${escapeHtml(caseData.vehicle_state || 'CA')})</strong><br>
          Vehicle: ${escapeHtml(caseData.vehicle_color || '')} ${escapeHtml(caseData.vehicle_make || '')} ${escapeHtml(caseData.vehicle_model || '')}<br>
          Date &amp; Time: ${formatDateTime(caseData.violation_date)}<br>
          Location: ${escapeHtml(caseData.location)}
        </div>

        <div class="court-section">
          <strong>II. RESPONDENT / DEFENDANT</strong><br>
          Driver Name: <strong>${escapeHtml(caseData.driver_name)}</strong><br>
          Driver License: <strong>${escapeHtml(caseData.driver_license)}</strong><br>
          Issuing Officer: ${escapeHtml(caseData.officer_name)} (${escapeHtml(caseData.officer_badge)})<br>
          Enforcement Unit: ${escapeHtml(caseData.department)}
        </div>
      </div>

      <div class="court-section" style="margin-bottom: 1.5rem;">
        <strong>III. OFFENSE CHARGED &amp; TELEMETRY</strong><br>
        Statutory Violation: <strong>${escapeHtml(caseData.violation_type)} (${escapeHtml(caseData.violation_code)})</strong><br>
        Telemetry Speed: ${caseData.speed_recorded ? `${caseData.speed_recorded} MPH in a ${caseData.speed_limit} MPH Zone` : 'Visual Observation / Video Capture'}<br>
        Attached Evidence: ${(caseData.evidence || []).map(e => e.evidence_type).join(', ') || 'Officer Sworn Citation'}
      </div>

      <div class="court-section" style="margin-bottom: 1.5rem;">
        <strong>IV. JUDICIAL DISPOSITION &amp; PENALTY ASSESSMENT</strong><br>
        Proceeding Type: <strong>${escapeHtml(outcome.adjudication_type)}</strong><br>
        Formal Verdict: <strong>${escapeHtml(outcome.verdict)}</strong><br>
        Original Statutory Fine: $${caseData.fine_amount.toFixed(2)} &nbsp;&bull;&nbsp; 
        Final Assessed Fine: <strong>$${outcome.adjusted_fine.toFixed(2)}</strong><br>
        Demerit Points Assessed: <strong>${outcome.penalty_points_assessed} Point(s)</strong><br>
        Remittance Status: <strong>${escapeHtml(outcome.payment_status)}</strong> (Ref: ${escapeHtml(outcome.payment_reference || 'N/A')})
      </div>

      <div class="court-findings-box">
        <strong>V. FINDINGS OF FACT AND LEGAL GROUNDS:</strong><br>
        ${escapeHtml(outcome.court_findings)}
      </div>

      <div style="font-size: 0.85rem; color: #475569;">
        <strong>APPELLATE RIGHTS:</strong> Under State Vehicle Code Section 40215, respondent maintains the right to appeal this determination within thirty (30) days of receipt of this notice (Statutory Appeal Deadline: ${outcome.appeal_deadline || '30 days'}).
      </div>

      <div class="court-signatures">
        <div class="court-sig-line">
          <strong>${escapeHtml(outcome.adjudicator_name)}</strong><br>
          Hearing Officer / Magistrate
        </div>
        <div class="court-sig-line">
          <strong>Date: ${outcome.hearing_date || new Date().toLocaleDateString()}</strong><br>
          Seal of Municipal Adjudication Clerk
        </div>
      </div>
    `;

    const modal = document.getElementById('printDispositionModal');
    if (modal) modal.classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// CASE 360 DOSSIER MODAL
// ==========================================
async function openCase360Modal(caseId) {
  try {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) throw new Error('Failed to load case 360 view');
    const caseData = await res.json();

    document.getElementById('modalCitationTitle').textContent = caseData.citation_number;
    const statusMeta = STATUS_BADGE_MAP[caseData.status] || { class: 'badge-neutral', icon: 'fa-circle-info' };
    const statusBadge = document.getElementById('modalStatusBadge');
    statusBadge.className = `badge ${statusMeta.class}`;
    statusBadge.innerHTML = `<i class="fa-solid ${statusMeta.icon}"></i> ${caseData.status}`;

    const modalBody = document.getElementById('caseDetailModalBody');
    modalBody.innerHTML = `
      <div class="dossier-grid mb-3">
        <div class="dossier-item">
          <span class="d-label">Vehicle Plate &amp; State</span>
          <span class="d-val font-mono"><span class="plate-tag">${escapeHtml(caseData.license_plate)}</span> (${caseData.vehicle_state})</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Make / Model / Color</span>
          <span class="d-val">${escapeHtml(caseData.vehicle_color || '')} ${escapeHtml(caseData.vehicle_make || '')} ${escapeHtml(caseData.vehicle_model || '')}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Offender Name</span>
          <span class="d-val font-bold">${escapeHtml(caseData.driver_name)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Driver License #</span>
          <span class="d-val font-mono">${escapeHtml(caseData.driver_license)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Violation Offense</span>
          <span class="d-val font-bold text-danger">${escapeHtml(caseData.violation_type)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Legal Code</span>
          <span class="d-val font-mono text-primary">${escapeHtml(caseData.violation_code)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Incident Location</span>
          <span class="d-val">${escapeHtml(caseData.location)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Violation Timestamp</span>
          <span class="d-val font-mono">${formatDateTime(caseData.violation_date)}</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Issuing Officer</span>
          <span class="d-val">${escapeHtml(caseData.officer_name)} (${escapeHtml(caseData.officer_badge)})</span>
        </div>
        <div class="dossier-item">
          <span class="d-label">Fine / Demerit Points</span>
          <span class="d-val font-mono font-bold">$${caseData.fine_amount.toFixed(2)} / ${caseData.demerit_points} pts</span>
        </div>
      </div>

      <div class="section-title"><i class="fa-solid fa-camera"></i> Attached Forensic Evidence (${(caseData.evidence || []).length})</div>
      <div class="table-responsive mb-3">
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>SHA-256 Hash</th>
              <th>Status</th>
              <th>Strength</th>
            </tr>
          </thead>
          <tbody>
            ${(caseData.evidence || []).map(e => `
              <tr>
                <td class="font-bold text-xs">${escapeHtml(e.evidence_type)}</td>
                <td>${escapeHtml(e.title)}</td>
                <td class="font-mono text-xs text-primary">${e.file_hash ? e.file_hash.slice(0, 16) + '...' : '--'}</td>
                <td><span class="badge ${e.review_status === 'Verified / Valid' ? 'badge-success' : 'badge-warning'} text-xs">${escapeHtml(e.review_status)}</span></td>
                <td><span class="badge badge-neutral text-xs">${escapeHtml(e.evidentiary_strength)}</span></td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="text-muted text-center py-2">No evidence attached.</td></tr>'}
          </tbody>
        </table>
      </div>

      ${caseData.outcome ? `
        <div class="section-title"><i class="fa-solid fa-gavel"></i> Case Disposition Ruling</div>
        <div class="card p-3 mb-3" style="background-color: var(--bg-card);">
          <div class="d-flex justify-between align-center mb-2">
            <span class="font-bold text-white">${escapeHtml(caseData.outcome.verdict)}</span>
            <span class="badge badge-success">${escapeHtml(caseData.outcome.adjudication_type)}</span>
          </div>
          <p class="text-sm text-secondary mb-2">${escapeHtml(caseData.outcome.court_findings)}</p>
          <div class="text-xs text-muted">
            Adjudicator: <strong>${escapeHtml(caseData.outcome.adjudicator_name)}</strong> | 
            Hearing Date: ${escapeHtml(caseData.outcome.hearing_date)} | 
            Payment: <strong>${escapeHtml(caseData.outcome.payment_status)}</strong>
          </div>
        </div>
      ` : '<div class="text-muted text-sm my-2"><i class="fa-solid fa-hourglass"></i> No formal adjudication ruling recorded yet.</div>'}

      <div class="d-flex justify-end gap-2 mt-3">
        <button class="btn btn-secondary" onclick="jumpToEvidence(${caseData.id}); closeModal('caseDetailModal');">
          <i class="fa-solid fa-camera-retro"></i> Open in Evidence Desk
        </button>
        <button class="btn btn-primary" onclick="jumpToAdjudication(${caseData.id}); closeModal('caseDetailModal');">
          <i class="fa-solid fa-gavel"></i> Open Adjudication
        </button>
      </div>
    `;

    const modal = document.getElementById('caseDetailModal');
    if (modal) modal.classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// AUDIT TRAIL
// ==========================================
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/cases');
    if (!res.ok) return;
    const cases = await res.json();

    // Collect all audit logs from cases
    let allLogs = [];
    for (const c of cases.slice(0, 8)) {
      try {
        const detailRes = await fetch(`/api/cases/${c.id}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (detail.logs) {
            detail.logs.forEach(l => {
              allLogs.push({ ...l, citation_number: detail.citation_number });
            });
          }
        }
      } catch (e) {}
    }

    // Sort by id descending
    allLogs.sort((a, b) => b.id - a.id);

    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;

    if (allLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No audit events recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = allLogs.slice(0, 30).map(l => {
      let actionClass = 'badge-neutral';
      if (l.action.includes('Created')) actionClass = 'badge-info';
      else if (l.action.includes('Evidence')) actionClass = 'badge-purple';
      else if (l.action.includes('Status')) actionClass = 'badge-warning';
      else if (l.action.includes('Adjudicated') || l.action.includes('Dismissed')) actionClass = 'badge-success';

      return `
        <tr>
          <td class="font-mono text-xs text-muted">#${l.id}</td>
          <td class="font-mono text-xs text-white">${escapeHtml(l.timestamp)}</td>
          <td><span class="citation-tag">${escapeHtml(l.citation_number || 'SYSTEM')}</span></td>
          <td><span class="badge ${actionClass} text-xs">${escapeHtml(l.action)}</span></td>
          <td class="font-bold text-white text-xs">${escapeHtml(l.actor)}</td>
          <td class="text-secondary text-xs">${escapeHtml(l.details || '')}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

// ==========================================
// DEMO RESET
// ==========================================
async function resetDemoData() {
  if (!confirm('Re-seed the database with realistic sample traffic citations, evidence images, and court outcomes?')) return;

  try {
    const res = await fetch('/api/seed', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset demo data');
    const data = await res.json();
    showToast(data.message || 'Demo data successfully reset!', 'success');

    // Reload all
    selectedEvidenceCaseId = null;
    selectedAdjudicationCaseId = null;
    currentInspectedEvidence = null;
    loadStats();
    loadCases();
    loadAuditLogs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// UTILITIES
// ==========================================
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(isoString) {
  if (!isoString) return '--';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return isoString;
  }
}
