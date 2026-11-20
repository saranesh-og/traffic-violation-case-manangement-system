import os
import hashlib
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory, abort
from werkzeug.utils import secure_filename
import database

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32 MB max upload

# Allowed upload extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'mov', 'pdf', 'txt', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Initialize database on startup
database.init_db()
database.seed_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ==========================================
# STATS & ANALYTICS API
# ==========================================
@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM cases")
    total_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM cases WHERE status IN ('Pending Review', 'Under Investigation')")
    pending_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM cases WHERE status = 'Evidence Verified'")
    verified_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM cases WHERE status IN ('Dispute Filed', 'Hearing Scheduled')")
    hearing_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM cases WHERE status IN ('Upheld / Guilty', 'Fine Reduced', 'Dismissed', 'Settled / Paid', 'Closed')")
    resolved_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(fine_amount), 0) FROM cases")
    total_fines_levied = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(adjusted_fine), 0) FROM outcomes WHERE payment_status = 'Paid in Full'")
    total_fines_collected = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM evidence")
    total_evidence_items = cursor.fetchone()[0]

    # Violation type breakdown
    cursor.execute("SELECT violation_type, COUNT(*) as count FROM cases GROUP BY violation_type ORDER BY count DESC LIMIT 6")
    violations_breakdown = [{'type': r['violation_type'], 'count': r['count']} for r in cursor.fetchall()]

    # Status breakdown
    cursor.execute("SELECT status, COUNT(*) as count FROM cases GROUP BY status ORDER BY count DESC")
    status_breakdown = [{'status': r['status'], 'count': r['count']} for r in cursor.fetchall()]

    conn.close()

    return jsonify({
        'total_cases': total_cases,
        'pending_cases': pending_cases,
        'verified_cases': verified_cases,
        'hearing_cases': hearing_cases,
        'resolved_cases': resolved_cases,
        'total_fines_levied': round(total_fines_levied, 2),
        'total_fines_collected': round(total_fines_collected, 2),
        'total_evidence_items': total_evidence_items,
        'violations_breakdown': violations_breakdown,
        'status_breakdown': status_breakdown
    })

# ==========================================
# CASES API
# ==========================================
@app.route('/api/cases', methods=['GET'])
def list_cases():
    search = request.args.get('search', '').strip()
    status = request.args.get('status', '').strip()
    severity = request.args.get('severity', '').strip()
    violation_type = request.args.get('violation_type', '').strip()

    conn = database.get_db()
    cursor = conn.cursor()

    query = """
        SELECT c.*, 
               (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id) as evidence_count,
               (SELECT verdict FROM outcomes o WHERE o.case_id = c.id) as outcome_verdict,
               (SELECT payment_status FROM outcomes o WHERE o.case_id = c.id) as payment_status
        FROM cases c
        WHERE 1=1
    """
    params = []

    if search:
        query += """ AND (
            c.citation_number LIKE ? OR
            c.license_plate LIKE ? OR
            c.driver_name LIKE ? OR
            c.driver_license LIKE ? OR
            c.violation_type LIKE ? OR
            c.location LIKE ? OR
            c.officer_name LIKE ?
        )"""
        s_wild = f"%{search}%"
        params.extend([s_wild] * 7)

    if status and status != 'ALL':
        query += " AND c.status = ?"
        params.append(status)

    if severity and severity != 'ALL':
        query += " AND c.severity = ?"
        params.append(severity)

    if violation_type and violation_type != 'ALL':
        query += " AND c.violation_type LIKE ?"
        params.append(f"%{violation_type}%")

    query += " ORDER BY c.id DESC"

    cursor.execute(query, params)
    cases = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify(cases)

@app.route('/api/cases', methods=['POST'])
def create_case():
    data = request.json or {}

    license_plate = (data.get('license_plate') or '').strip().upper()
    driver_name = (data.get('driver_name') or '').strip()
    driver_license = (data.get('driver_license') or '').strip().upper()
    violation_type = (data.get('violation_type') or '').strip()
    violation_code = (data.get('violation_code') or '').strip().upper()
    location = (data.get('location') or '').strip()
    fine_amount = float(data.get('fine_amount') or 0.0)

    if not license_plate or not driver_name or not violation_type or not location or fine_amount <= 0:
        return jsonify({'error': 'License plate, driver name, violation type, location, and fine amount are required.'}), 400

    conn = database.get_db()
    cursor = conn.cursor()

    # Generate citation number if not provided
    citation_number = data.get('citation_number')
    if not citation_number:
        cursor.execute("SELECT MAX(id) FROM cases")
        max_id = (cursor.fetchone()[0] or 0) + 1
        citation_number = f"CIT-2026-{1000 + max_id}"

    cursor.execute("""
        INSERT INTO cases (
            citation_number, license_plate, vehicle_state, vehicle_make, vehicle_model, vehicle_color,
            driver_name, driver_license, driver_phone, driver_email,
            violation_type, violation_code, violation_date,
            location, speed_recorded, speed_limit,
            officer_name, officer_badge, department,
            device_id, fine_amount, demerit_points, status, severity, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        citation_number,
        license_plate,
        data.get('vehicle_state', 'CA'),
        data.get('vehicle_make', ''),
        data.get('vehicle_model', ''),
        data.get('vehicle_color', ''),
        driver_name,
        driver_license,
        data.get('driver_phone', ''),
        data.get('driver_email', ''),
        violation_type,
        violation_code or 'VC-GENERIC',
        data.get('violation_date', datetime.now().strftime('%Y-%m-%dT%H:%M')),
        location,
        int(data.get('speed_recorded')) if data.get('speed_recorded') else None,
        int(data.get('speed_limit')) if data.get('speed_limit') else None,
        data.get('officer_name', 'Enforcement Officer'),
        data.get('officer_badge', 'BADGE-DEFAULT'),
        data.get('department', 'Traffic Enforcement Division'),
        data.get('device_id', 'CAD-TERMINAL'),
        fine_amount,
        int(data.get('demerit_points', 0)),
        data.get('status', 'Pending Review'),
        data.get('severity', 'Moderate'),
        data.get('notes', '')
    ))

    new_id = cursor.lastrowid
    conn.commit()

    database.log_action(
        new_id,
        'Citation Created',
        data.get('officer_name', 'Enforcement Officer'),
        f"Citation {citation_number} registered for vehicle {license_plate} ({violation_type})."
    )

    cursor.execute("SELECT * FROM cases WHERE id = ?", (new_id,))
    created_case = dict(cursor.fetchone())
    conn.close()

    return jsonify(created_case), 201

@app.route('/api/cases/<int:case_id>', methods=['GET'])
def get_case_detail(case_id):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
    case_row = cursor.fetchone()
    if not case_row:
        conn.close()
        return jsonify({'error': 'Case not found'}), 404

    case_data = dict(case_row)

    # Fetch evidence items
    cursor.execute("SELECT * FROM evidence WHERE case_id = ? ORDER BY id ASC", (case_id,))
    case_data['evidence'] = [dict(r) for r in cursor.fetchall()]

    # Fetch outcome if any
    cursor.execute("SELECT * FROM outcomes WHERE case_id = ?", (case_id,))
    outcome_row = cursor.fetchone()
    case_data['outcome'] = dict(outcome_row) if outcome_row else None

    # Fetch audit logs
    cursor.execute("SELECT * FROM audit_logs WHERE case_id = ? ORDER BY id DESC", (case_id,))
    case_data['logs'] = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return jsonify(case_data)

@app.route('/api/cases/<int:case_id>', methods=['PUT'])
def update_case(case_id):
    data = request.json or {}
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Case not found'}), 404

    cursor.execute("""
        UPDATE cases SET
            license_plate = COALESCE(?, license_plate),
            vehicle_make = COALESCE(?, vehicle_make),
            vehicle_model = COALESCE(?, vehicle_model),
            vehicle_color = COALESCE(?, vehicle_color),
            driver_name = COALESCE(?, driver_name),
            driver_license = COALESCE(?, driver_license),
            driver_phone = COALESCE(?, driver_phone),
            driver_email = COALESCE(?, driver_email),
            violation_type = COALESCE(?, violation_type),
            violation_code = COALESCE(?, violation_code),
            location = COALESCE(?, location),
            speed_recorded = COALESCE(?, speed_recorded),
            speed_limit = COALESCE(?, speed_limit),
            fine_amount = COALESCE(?, fine_amount),
            demerit_points = COALESCE(?, demerit_points),
            status = COALESCE(?, status),
            severity = COALESCE(?, severity),
            notes = COALESCE(?, notes),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
    """, (
        data.get('license_plate'),
        data.get('vehicle_make'),
        data.get('vehicle_model'),
        data.get('vehicle_color'),
        data.get('driver_name'),
        data.get('driver_license'),
        data.get('driver_phone'),
        data.get('driver_email'),
        data.get('violation_type'),
        data.get('violation_code'),
        data.get('location'),
        data.get('speed_recorded'),
        data.get('speed_limit'),
        data.get('fine_amount'),
        data.get('demerit_points'),
        data.get('status'),
        data.get('severity'),
        data.get('notes'),
        case_id
    ))

    conn.commit()

    database.log_action(
        case_id,
        'Case Record Updated',
        data.get('actor', 'Case Manager'),
        f"Case fields modified. Status: {data.get('status', existing['status'])}"
    )

    cursor.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
    updated_case = dict(cursor.fetchone())
    conn.close()

    return jsonify(updated_case)

@app.route('/api/cases/<int:case_id>/status', methods=['PATCH'])
def update_case_status(case_id):
    data = request.json or {}
    new_status = data.get('status')
    actor = data.get('actor', 'Case Reviewer')
    reason = data.get('reason', '')

    if not new_status:
        return jsonify({'error': 'Status is required'}), 400

    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT status FROM cases WHERE id = ?", (case_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Case not found'}), 404

    old_status = row['status']
    cursor.execute("""
        UPDATE cases 
        SET status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    """, (new_status, case_id))
    conn.commit()
    conn.close()

    log_desc = f"Status changed from '{old_status}' to '{new_status}'."
    if reason:
        log_desc += f" Reason: {reason}"
    database.log_action(case_id, 'Status Updated', actor, log_desc)

    return jsonify({'success': True, 'case_id': case_id, 'old_status': old_status, 'new_status': new_status})

# ==========================================
# EVIDENCE REVIEW API
# ==========================================
@app.route('/api/cases/<int:case_id>/evidence', methods=['POST'])
def add_evidence(case_id):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, citation_number FROM cases WHERE id = ?", (case_id,))
    case_row = cursor.fetchone()
    if not case_row:
        conn.close()
        return jsonify({'error': 'Case not found'}), 404

    # Check if a file was uploaded or form JSON
    file_path = ''
    file_hash = ''
    media_type = 'image'

    if 'file' in request.files:
        uploaded = request.files['file']
        if uploaded and uploaded.filename and allowed_file(uploaded.filename):
            filename = f"ev_{case_id}_{int(datetime.now().timestamp())}_{secure_filename(uploaded.filename)}"
            destination = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            uploaded.save(destination)

            # Compute SHA-256 for chain of custody
            with open(destination, 'rb') as f:
                content = f.read()
                file_hash = database.calculate_sha256(content)

            file_path = f"/uploads/{filename}"
            ext = filename.rsplit('.', 1)[1].lower()
            if ext in {'mp4', 'mov'}:
                media_type = 'video'
            elif ext in {'pdf', 'txt', 'csv'}:
                media_type = 'document'
            else:
                media_type = 'image'
        else:
            conn.close()
            return jsonify({'error': 'Invalid or missing file'}), 400
    else:
        # JSON / Form payload fallback
        data = request.form if request.form else (request.json or {})
        file_path = data.get('file_path') or '/static/assets/evidence_speed_7xyz982.svg'
        media_type = data.get('media_type') or 'image'
        file_hash = data.get('file_hash') or hashlib.sha256(f"{case_id}-{datetime.now()}".encode()).hexdigest()

    form_data = request.form if request.form else (request.json or {})
    title = form_data.get('title') or 'Digital Enforcement Capture'
    evidence_type = form_data.get('evidence_type') or 'Speed Camera Photo'
    description = form_data.get('description') or ''
    captured_at = form_data.get('captured_at') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    captured_by = form_data.get('captured_by') or 'Automated Enforcement Unit'
    device_serial = form_data.get('device_serial') or 'UNIT-AUTO-01'
    evidentiary_strength = form_data.get('evidentiary_strength') or 'Corroborative'
    review_status = form_data.get('review_status') or 'Pending'
    reviewed_by = form_data.get('reviewed_by') or ''
    analyst_notes = form_data.get('analyst_notes') or ''

    cursor.execute("""
        INSERT INTO evidence (
            case_id, evidence_type, title, description, file_path, media_type,
            file_hash, captured_at, captured_by, device_serial, review_status,
            evidentiary_strength, analyst_notes, reviewed_by, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        case_id, evidence_type, title, description, file_path, media_type,
        file_hash, captured_at, captured_by, device_serial, review_status,
        evidentiary_strength, analyst_notes, reviewed_by,
        datetime.now().strftime('%Y-%m-%d %H:%M:%S') if reviewed_by else None
    ))

    new_evidence_id = cursor.lastrowid
    conn.commit()

    database.log_action(
        case_id,
        'Evidence Uploaded',
        captured_by,
        f"Attached '{title}' ({evidence_type}). SHA-256: {file_hash[:16]}..."
    )

    cursor.execute("SELECT * FROM evidence WHERE id = ?", (new_evidence_id,))
    new_evidence = dict(cursor.fetchone())
    conn.close()

    return jsonify(new_evidence), 201

@app.route('/api/evidence/<int:evidence_id>', methods=['PUT'])
def review_evidence(evidence_id):
    data = request.json or {}
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        return jsonify({'error': 'Evidence item not found'}), 404

    case_id = item['case_id']
    review_status = data.get('review_status', item['review_status'])
    evidentiary_strength = data.get('evidentiary_strength', item['evidentiary_strength'])
    analyst_notes = data.get('analyst_notes', item['analyst_notes'])
    reviewed_by = data.get('reviewed_by') or 'Evidence Analyst'

    cursor.execute("""
        UPDATE evidence SET
            review_status = ?,
            evidentiary_strength = ?,
            analyst_notes = ?,
            reviewed_by = ?,
            reviewed_at = datetime('now', 'localtime')
        WHERE id = ?
    """, (review_status, evidentiary_strength, analyst_notes, reviewed_by, evidence_id))
    conn.commit()

    database.log_action(
        case_id,
        'Evidence Reviewed',
        reviewed_by,
        f"Evidence #{evidence_id} marked '{review_status}' ({evidentiary_strength})."
    )

    cursor.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,))
    updated = dict(cursor.fetchone())
    conn.close()

    return jsonify(updated)

# ==========================================
# CASE OUTCOMES & ADJUDICATION API
# ==========================================
@app.route('/api/cases/<int:case_id>/outcome', methods=['GET', 'POST', 'PUT'])
def handle_case_outcome(case_id):
    conn = database.get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
    case_row = cursor.fetchone()
    if not case_row:
        conn.close()
        return jsonify({'error': 'Case not found'}), 404

    if request.method == 'GET':
        cursor.execute("SELECT * FROM outcomes WHERE case_id = ?", (case_id,))
        outcome_row = cursor.fetchone()
        conn.close()
        if not outcome_row:
            return jsonify({'message': 'No outcome registered for this case yet'}), 404
        return jsonify(dict(outcome_row))

    # POST or PUT outcome
    data = request.json or {}
    adjudication_type = data.get('adjudication_type', 'Administrative Review')
    verdict = data.get('verdict', 'Citation Upheld (Guilty)')
    adjudicator_name = data.get('adjudicator_name', 'Hearing Officer')
    hearing_date = data.get('hearing_date', datetime.now().strftime('%Y-%m-%d'))
    original_fine = float(data.get('original_fine', case_row['fine_amount']))
    adjusted_fine = float(data.get('adjusted_fine', original_fine))
    penalty_points = int(data.get('penalty_points_assessed', case_row['demerit_points']))
    payment_status = data.get('payment_status', 'Pending')
    payment_reference = data.get('payment_reference', '')
    court_findings = data.get('court_findings', '')
    appeal_deadline = data.get('appeal_deadline') or (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
    appeal_status = data.get('appeal_status', 'Not Filed')

    # Upsert outcome
    cursor.execute("SELECT id FROM outcomes WHERE case_id = ?", (case_id,))
    existing_outcome = cursor.fetchone()

    if existing_outcome:
        cursor.execute("""
            UPDATE outcomes SET
                adjudication_type = ?,
                verdict = ?,
                adjudicator_name = ?,
                hearing_date = ?,
                original_fine = ?,
                adjusted_fine = ?,
                penalty_points_assessed = ?,
                payment_status = ?,
                payment_reference = ?,
                court_findings = ?,
                appeal_deadline = ?,
                appeal_status = ?,
                closed_at = datetime('now', 'localtime')
            WHERE case_id = ?
        """, (
            adjudication_type, verdict, adjudicator_name, hearing_date,
            original_fine, adjusted_fine, penalty_points, payment_status,
            payment_reference, court_findings, appeal_deadline, appeal_status,
            case_id
        ))
    else:
        cursor.execute("""
            INSERT INTO outcomes (
                case_id, adjudication_type, verdict, adjudicator_name, hearing_date,
                original_fine, adjusted_fine, penalty_points_assessed, payment_status,
                payment_reference, court_findings, appeal_deadline, appeal_status, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        """, (
            case_id, adjudication_type, verdict, adjudicator_name, hearing_date,
            original_fine, adjusted_fine, penalty_points, payment_status,
            payment_reference, court_findings, appeal_deadline, appeal_status
        ))

    # Synchronize case status according to verdict
    new_case_status = 'Closed'
    if 'Dismissed' in verdict or 'Acquitted' in verdict:
        new_case_status = 'Dismissed'
    elif 'Reduced' in verdict:
        new_case_status = 'Fine Reduced'
    elif 'Upheld' in verdict:
        if payment_status == 'Paid in Full':
            new_case_status = 'Settled / Paid'
        else:
            new_case_status = 'Upheld / Guilty'

    cursor.execute("""
        UPDATE cases 
        SET status = ?, demerit_points = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    """, (new_case_status, penalty_points, case_id))

    conn.commit()

    database.log_action(
        case_id,
        'Outcome Adjudicated',
        adjudicator_name,
        f"Verdict rendered: '{verdict}'. Fine: ${adjusted_fine:.2f}, Payment: {payment_status}."
    )

    cursor.execute("SELECT * FROM outcomes WHERE case_id = ?", (case_id,))
    saved_outcome = dict(cursor.fetchone())
    conn.close()

    return jsonify(saved_outcome), 200

# ==========================================
# RESET / SEED DATA API
# ==========================================
@app.route('/api/seed', methods=['POST'])
def reset_seed_data():
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM audit_logs")
    cursor.execute("DELETE FROM outcomes")
    cursor.execute("DELETE FROM evidence")
    cursor.execute("DELETE FROM cases")
    conn.commit()
    conn.close()

    database.seed_db()
    return jsonify({'success': True, 'message': 'Database re-seeded with realistic traffic cases!'})

if __name__ == '__main__':
    print("Starting Traffic Violation Case Management System on http://127.0.0.1:5000 ...")
    app.run(host='0.0.0.0', port=5000, debug=True)
