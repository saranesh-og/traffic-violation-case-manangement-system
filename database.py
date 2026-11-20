import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'traffic_cases.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Cases table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        citation_number TEXT UNIQUE NOT NULL,
        license_plate TEXT NOT NULL,
        vehicle_state TEXT DEFAULT 'CA',
        vehicle_make TEXT,
        vehicle_model TEXT,
        vehicle_color TEXT,
        driver_name TEXT NOT NULL,
        driver_license TEXT NOT NULL,
        driver_phone TEXT,
        driver_email TEXT,
        violation_type TEXT NOT NULL,
        violation_code TEXT NOT NULL,
        violation_date TEXT NOT NULL,
        location TEXT NOT NULL,
        speed_recorded INTEGER,
        speed_limit INTEGER,
        officer_name TEXT NOT NULL,
        officer_badge TEXT NOT NULL,
        department TEXT DEFAULT 'Traffic Enforcement Division',
        device_id TEXT,
        fine_amount REAL NOT NULL,
        demerit_points INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Pending Review',
        severity TEXT DEFAULT 'Moderate',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
    """)

    # 2. Evidence table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL,
        evidence_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_path TEXT,
        media_type TEXT DEFAULT 'image',
        file_hash TEXT,
        captured_at TEXT,
        captured_by TEXT,
        device_serial TEXT,
        review_status TEXT DEFAULT 'Pending',
        evidentiary_strength TEXT DEFAULT 'Corroborative',
        analyst_notes TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
    """)

    # 3. Case Outcomes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER UNIQUE NOT NULL,
        adjudication_type TEXT NOT NULL,
        verdict TEXT NOT NULL,
        adjudicator_name TEXT NOT NULL,
        hearing_date TEXT NOT NULL,
        original_fine REAL NOT NULL,
        adjusted_fine REAL NOT NULL,
        penalty_points_assessed INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'Pending',
        payment_reference TEXT,
        court_findings TEXT,
        appeal_deadline TEXT,
        appeal_status TEXT DEFAULT 'Not Filed',
        closed_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
    """)

    # 4. Audit Log table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        details TEXT,
        timestamp TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    conn.close()

def log_action(case_id, action, actor, details):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO audit_logs (case_id, action, actor, details, timestamp)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    """, (case_id, action, actor, details))
    conn.commit()
    conn.close()

def calculate_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

def seed_db():
    conn = get_db()
    cursor = conn.cursor()

    # Check if cases already exist
    cursor.execute("SELECT COUNT(*) FROM cases")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    sample_cases = [
        (
            'CIT-2026-0814', '7XYZ982', 'CA', 'Tesla', 'Model Y', 'Midnight Silver',
            'Marcus Vance', 'D4928172', '(555) 234-8901', 'marcus.v@example.com',
            'Speeding (Exceeding limit by 24 mph)', 'VC-22349(a)', '2026-11-14T08:42',
            'I-280 Northbound at Page Mill Rd Exit', 89, 65,
            'Officer David Chen', 'BADGE-4182', 'California Highway Patrol',
            'RADAR-STK-8819', 385.00, 1, 'Evidence Verified', 'Moderate',
            'Target vehicle tracked in lane 1 accelerating during commute hours.'
        ),
        (
            'CIT-2026-0815', '6ABC321', 'CA', 'Ford', 'Mustang GT', 'Velocity Blue',
            'Elena Rostova', 'E1829034', '(555) 891-2311', 'elena.r@example.com',
            'Red Light Running (Automated Intersection)', 'VC-21453(a)', '2026-11-12T21:15',
            'Market St & 4th St Intersection (Westbound)', 42, 35,
            'Automated Camera Unit #4', 'AUTO-SF04', 'Municipal Traffic Division',
            'REDFLEX-CAM-301', 490.00, 1, 'Hearing Scheduled', 'Moderate',
            'Crossed stop line 0.82 seconds after signal transitioned to red.'
        ),
        (
            'CIT-2026-0792', '8KLM412', 'CA', 'Honda', 'Civic Type R', 'Crystal Black',
            'Julian Thorne', 'J7721839', '(555) 431-9024', 'jthorne@example.com',
            'Reckless Driving & High-Occupancy Lane Abuse', 'VC-23103', '2026-11-08T17:22',
            'US-101 Southbound near Shoreline Blvd', 104, 65,
            'Sgt. Rebecca Torres', 'BADGE-2109', 'California Highway Patrol',
            'LIDAR-PL-402', 1250.00, 2, 'Upheld / Guilty', 'Severe / Misdemeanor',
            'Rapid weaving across 4 lanes without indicators, single occupant in carpool lane.'
        ),
        (
            'CIT-2026-0775', '5TYP903', 'WA', 'Toyota', 'RAV4 Hybrid', 'Super White',
            'Sarah Jenkins', 'W9912034', '(555) 672-1188', 's.jenkins@example.com',
            'School Zone Excessive Speeding', 'VC-22358.4', '2026-11-05T14:40',
            'Lincoln Elementary School Zone - El Camino Real', 44, 25,
            'Officer Michael Adams', 'BADGE-3304', 'City Police Department',
            'LIDAR-TRUSPEED-09', 520.00, 1, 'Fine Reduced', 'Moderate',
            'Active yellow school beacons flashing during afternoon student dismissal.'
        ),
        (
            'CIT-2026-0761', '3JKL555', 'NV', 'Chevrolet', 'Silverado 1500', 'Summit White',
            'Arthur Pendelton', 'N3321908', '(555) 902-3341', 'art.pendelton@example.com',
            'Failure to Obey Regulatory Sign / Illegal Turn', 'VC-21461', '2026-10-29T11:10',
            'Grand Avenue & Pine St Intersection', 18, 30,
            'Officer David Chen', 'BADGE-4182', 'City Police Department',
            'UNIT-CRUISER-14', 238.00, 1, 'Dismissed', 'Minor',
            'Turned left where No Left Turn sign is posted.'
        ),
        (
            'CIT-2026-0820', '9QWE812', 'CA', 'BMW', 'M4 Competition', 'Isle of Man Green',
            'Derek Zhao', 'D9018274', '(555) 345-9812', 'derek.zhao@example.com',
            'Excessive Speed Over 100 MPH', 'VC-22348(b)', '2026-11-18T01:14',
            'Interstate 5 Southbound MP 184.2', 112, 65,
            'Officer Tyler Wright', 'BADGE-5512', 'California Highway Patrol',
            'STALKER-LIDAR-77', 1800.00, 2, 'Pending Review', 'Severe / Misdemeanor',
            'Clocked at 112 mph in light traffic. Immediate mandatory court appearance standard.'
        ),
        (
            'CIT-2026-0801', '4BNM672', 'CA', 'Mercedes-Benz', 'C300', 'Polar White',
            'Priya Nair', 'P8812940', '(555) 887-2199', 'priya.nair@example.com',
            'Cell Phone Handheld Operation while Driving', 'VC-23123.5', '2026-11-10T16:05',
            'Embarcadero & Mission St', 35, 35,
            'Officer Lisa Raymond', 'BADGE-4091', 'San Francisco Police Dept',
            'MUNI-OBS-99', 162.00, 0, 'Settled / Paid', 'Infraction',
            'Observed texting while stopped at intersection and continuing onto thoroughfare.'
        )
    ]

    for c in sample_cases:
        cursor.execute("""
            INSERT INTO cases (
                citation_number, license_plate, vehicle_state, vehicle_make, vehicle_model, vehicle_color,
                driver_name, driver_license, driver_phone, driver_email,
                violation_type, violation_code, violation_date,
                location, speed_recorded, speed_limit,
                officer_name, officer_badge, department,
                device_id, fine_amount, demerit_points, status, severity, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, c)

    # Sample Evidence items
    sample_evidence = [
        # Case 1 evidence
        (
            1, 'Speed Camera Photo', 'High-Speed Telemetry & Plate Crop',
            'Automated highway gantry camera capture with OCR confidence score 99.4% and embedded radar telemetry HUD.',
            '/static/assets/evidence_speed_7xyz982.svg', 'image',
            'd9a4f61e80931456209bca3b17457efb293810457639201948ba932174823901',
            '2026-11-14 08:42:11', 'Highway Camera Gantry #12', 'STK-8819',
            'Verified / Valid', 'Conclusive',
            'Vehicle license plate clearly matches DMV registration. Radar calibration valid through 2027.',
            'Analyst Keith Morris', '2026-11-15 09:30:00'
        ),
        (
            1, 'Radar Calibration Log', 'Doppler Radar Annual Certification Certificate',
            'Official Bureau of Automotive Measurement accuracy certificate verifying zero drift (+/- 0.5 mph tolerance).',
            '/static/assets/evidence_radar_cert.svg', 'document',
            '74a9bc83716d00192ea81b94503712837bcda120498172948201740928172901',
            '2026-10-01 08:00:00', 'State Metrology Lab', 'CAL-99120',
            'Verified / Valid', 'Corroborative',
            'Device tuning fork calibration tests executed and logged before and after tour of duty.',
            'Analyst Keith Morris', '2026-11-15 09:35:00'
        ),
        # Case 2 evidence
        (
            2, 'Red Light Camera Photo', 'Intersection Red Light Stop Bar Violation Frame',
            'Synchronized photo showing rear axle crossing stop bar 0.82 seconds after amber extinguished.',
            '/static/assets/evidence_redlight_6abc321.svg', 'image',
            'e837190248abec23019847120394857291048291038472910482910482910293',
            '2026-11-12 21:15:30', 'Intersection System Unit 4', 'REDFLEX-CAM-301',
            'Verified / Valid', 'Conclusive',
            'Signal timing logs cross-checked with City Traffic Signal Management. Amber clearance was 4.2 seconds.',
            'Reviewer Karen Davis', '2026-11-13 11:20:00'
        ),
        (
            2, 'Dashcam Video Simulation', 'Traffic Sensor Sequence Simulation',
            '10-second traffic scene capture showing vehicle entry trajectory and traffic flow at intersection.',
            '/static/assets/evidence_dashcam_sim.svg', 'video',
            'b491823749102837491028472910294829103847192038471920384719203847',
            '2026-11-12 21:15:28', 'Intersection System Unit 4', 'REDFLEX-CAM-301',
            'Pending', 'Corroborative',
            'Defendant counsel requested review of yellow-light duration under CA MUTCD standards.',
            'Reviewer Karen Davis', '2026-11-13 11:30:00'
        ),
        # Case 3 evidence
        (
            3, 'Dashcam Footage', 'Patrol Vehicle HD Cruiser Video (Weaving & Speeding)',
            'Mounted forward camera capturing high-speed evasive maneuvering through congested traffic lanes.',
            '/static/assets/evidence_dashcam_reckless.svg', 'video',
            'ca48192038471920384719203847192038471920384719203847192038471920',
            '2026-11-08 17:22:15', 'Cruiser #704 Dashcam', 'PATROL-CAM-704',
            'Verified / Valid', 'Conclusive',
            'Clear footage corroborating officer notes. Vehicle attained 104 mph in 65 mph zone.',
            'Investigator Frank Reynolds', '2026-11-09 14:10:00'
        ),
        # Case 4 evidence
        (
            4, 'School Zone Photo', 'Flashing Beacon & Speed Telemetry Image',
            'LIDAR camera image showing vehicle in 25 MPH school zone during active amber flash beacon.',
            '/static/assets/evidence_schoolzone.svg', 'image',
            'f839102837491028374910283749102837491028374910283749102837491028',
            '2026-11-05 14:40:02', 'LIDAR Unit 9', 'TRUSPEED-09',
            'Verified / Valid', 'Corroborative',
            'Vehicle was decelerating at time of lock. Officer noted driver was cooperative.',
            'Officer Michael Adams', '2026-11-06 08:15:00'
        ),
        # Case 5 evidence
        (
            5, 'Scene Photo', 'Obscured Regulatory Traffic Sign Evidence',
            'Defense photograph showing overgrown eucalyptus branches obstructing "No U-Turn" sign from 50 yards.',
            '/static/assets/evidence_obscured_sign.svg', 'image',
            'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
            '2026-10-30 10:00:00', 'Driver Submission / Public Works', 'N/A',
            'Verified / Valid', 'Conclusive',
            'Public Works confirms work order #PW-8812 was open to trim obscured regulatory signs at this corner.',
            'Hearing Officer Linda Morales', '2026-11-02 16:00:00'
        )
    ]

    for ev in sample_evidence:
        cursor.execute("""
            INSERT INTO evidence (
                case_id, evidence_type, title, description, file_path, media_type,
                file_hash, captured_at, captured_by, device_serial, review_status,
                evidentiary_strength, analyst_notes, reviewed_by, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, ev)

    # Sample Outcomes
    sample_outcomes = [
        # Case 3 Outcome (Upheld)
        (
            3, 'Municipal Court Adjudication', 'Citation Upheld (Guilty)',
            'Judge Howard Sterling, Dept 4', '2026-11-16',
            1250.00, 1250.00, 2, 'Installment Plan', 'PAY-PLAN-4412',
            'Court examined dashcam recording and LIDAR certification. High reckless rate established beyond reasonable doubt. Court grants monthly payment arrangement of $250/mo. Completion of 12-hour advanced driver safety program mandated within 90 days.',
            '2026-12-16', 'Not Filed', '2026-11-16 16:30:00'
        ),
        # Case 4 Outcome (Reduced)
        (
            4, 'Informal Hearing', 'Fine Reduced',
            'Hearing Officer Linda Morales', '2026-11-12',
            520.00, 260.00, 0, 'Paid in Full', 'TXN-99812-CC',
            'Respondent presented evidence of sudden deceleration and 15-year unblemished driving history. Hearing Officer exercised administrative discretion under Rule 4.2 to reduce penalty by 50% upon immediate payment and completion of defensive driving course.',
            '2026-12-12', 'Not Filed', '2026-11-12 14:00:00'
        ),
        # Case 5 Outcome (Dismissed)
        (
            5, 'Administrative Review', 'Dismissed - Insufficient Evidence',
            'Senior Magistrate Elena Rostova', '2026-11-03',
            238.00, 0.00, 0, 'Waived', 'DISMISS-PW-990',
            'Clear visual evidence confirmed that Municipal Public Works foliage obstructed driver line-of-sight to regulatory prohibition sign below legal minimum distance. Citation dismissed with prejudice.',
            '2026-12-03', 'Not Filed', '2026-11-03 11:45:00'
        ),
        # Case 7 Outcome (Settled/Paid)
        (
            7, 'Pre-Trial Settlement', 'Citation Upheld (Guilty)',
            'Administrative Bureau Clerk', '2026-11-11',
            162.00, 162.00, 0, 'Paid in Full', 'PAY-992182',
            'Driver admitted infraction and paid standard schedule fine online. Demerit point not assessed for first handheld cell infraction per state code.',
            '2026-12-11', 'Not Filed', '2026-11-11 17:02:00'
        )
    ]

    for oc in sample_outcomes:
        cursor.execute("""
            INSERT INTO outcomes (
                case_id, adjudication_type, verdict, adjudicator_name, hearing_date,
                original_fine, adjusted_fine, penalty_points_assessed, payment_status,
                payment_reference, court_findings, appeal_deadline, appeal_status, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, oc)

    # Sample Audit logs
    sample_logs = [
        (1, 'Citation Created', 'Officer David Chen', 'Electronic citation CIT-2026-0814 issued via Mobile Police CAD terminal.'),
        (1, 'Evidence Uploaded', 'System Ingest', 'Automated gantry camera image & OCR crop ingested with hash validation.'),
        (1, 'Evidence Verified', 'Analyst Keith Morris', 'Reviewed radar telemetry, marked as Conclusive evidence.'),
        (2, 'Citation Created', 'Auto Enforcement', 'Citation CIT-2026-0815 triggered by RedFlex Camera Unit 4.'),
        (2, 'Dispute Filed', 'Defendant Counsel', 'Formal dispute logged claiming insufficient amber phase timing.'),
        (2, 'Hearing Scheduled', 'Clerk of Court', 'Scheduled informal administrative hearing for Dec 02, 2026.'),
        (3, 'Citation Created', 'Sgt. Rebecca Torres', 'Reckless driving citation filed with court reference.'),
        (3, 'Case Adjudicated', 'Judge Howard Sterling', 'Verdict rendered: Citation Upheld. Fines set at $1,250 with payment plan.'),
        (4, 'Hearing Conducted', 'Officer Linda Morales', 'Respondent appeared; fine reduced to $260 on condition of traffic school.'),
        (4, 'Payment Recorded', 'Treasury System', 'Payment $260.00 settled via credit card TXN-99812-CC.'),
        (5, 'Evidence Submitted', 'Arthur Pendelton', 'Submitted scene photographs of foliage obstruction.'),
        (5, 'Case Dismissed', 'Senior Magistrate Elena Rostova', 'Dismissed on regulatory sign visibility grounds.'),
        (6, 'Citation Created', 'Officer Tyler Wright', 'Citation CIT-2026-0820 logged for excessive speeding (112 MPH).')
    ]

    for lg in sample_logs:
        cursor.execute("""
            INSERT INTO audit_logs (case_id, action, actor, details)
            VALUES (?, ?, ?, ?)
        """, lg)

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    seed_db()
    print("Database initialized and seeded successfully!")
