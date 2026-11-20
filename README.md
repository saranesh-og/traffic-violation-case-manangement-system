# Traffic Violation Case Management System (TVCMS)

A full-stack, enterprise-grade municipal traffic enforcement and judicial adjudication management system. Built with **Python (Flask)** on the backend, **SQLite** with ACID transactional integrity, and a **responsive Single-Page Application (SPA)** on the frontend.

---

## 🏛️ System Overview & Purpose

The **Traffic Violation Case Management System (TVCMS)** is engineered to handle the complete lifecycle of civil and criminal traffic infractions:

1. **Organize Violation Records**: Electronic citation generation, vehicle license plate identification, driver information, statutory violation codes, automated speed telemetry, and fine scheduling.
2. **Forensic Evidence Review Desk**: Digital evidence ingestion, automated SHA-256 chain-of-custody checksum validation, camera gantry / LIDAR sensor overlays, high-resolution license plate OCR inspection, and evidentiary admissibility scoring (`Conclusive`, `Corroborative`, `Circumstantial`).
3. **Case Outcomes & Adjudication**: Magistrate hearing docket, formal rulings (`Citation Upheld`, `Fine Reduced`, `Dismissed - Insufficient Evidence`, `Dismissed - Equipment Error`, `Traffic School Assigned`), fine recalculation, and automated generation of official printable court disposition records.
4. **Audit Trail & Legal Compliance**: Immutable chronological log capturing every action, status transition, evidence upload, review finding, and judicial verdict.

---

## 🛠️ Architecture & Technology Stack

| Layer | Component | Description |
|---|---|---|
| **Backend** | Python 3.15 + Flask 3.1 | RESTful Web API, route management, file upload handler with SHA-256 calculation |
| **Database** | SQLite 3 (`traffic_cases.db`) | Relational schema with foreign keys, cascading deletes, indexes, and WAL mode |
| **Frontend** | HTML5 + CSS3 + Vanilla ES6 JS | Fast, responsive single-page portal with custom law enforcement/court styling |
| **Evidence Viewer** | Vector SVG + HTML5 Media | High-resolution telemetry HUDs, sensor replay scrubbers, OCR plate zoom windows |
| **Security** | SHA-256 Hashing | Cryptographic tamper-detection for all digital evidence items |

---

## 📁 Project Structure

```
traffic_violation_system/
├── app.py                     # Flask REST API & web application entrypoint
├── database.py                # Database schema, migrations, seed data & helpers
├── requirements.txt           # Python package dependencies
├── README.md                  # System documentation & API guide
├── static/
│   ├── css/
│   │   └── style.css          # Custom municipal & law enforcement dark/light UI
│   ├── js/
│   │   └── app.js             # Reactive SPA engine & API client
│   └── assets/                # Forensic evidence graphics & telemetry HUDs
│       ├── evidence_speed_7xyz982.svg
│       ├── evidence_redlight_6abc321.svg
│       ├── evidence_radar_cert.svg
│       ├── evidence_dashcam_sim.svg
│       ├── evidence_dashcam_reckless.svg
│       ├── evidence_schoolzone.svg
│       └── evidence_obscured_sign.svg
├── templates/
│   └── index.html             # Main application dashboard & modal views
└── uploads/                   # Secure storage for uploaded evidence files
```

---

## 🚀 How to Run

### 1. Requirements
- Python 3.9+
- Flask (`pip install flask`)

### 2. Launch the Application
```powershell
cd C:\Users\Guruvayurappan\.gemini\antigravity\scratch\traffic_violation_system
python app.py
```

Open your browser and navigate to:
**`http://127.0.0.1:5000`**

*(The system automatically creates the SQLite database and seeds it with realistic pre-configured traffic violation records, high-resolution evidence, and sample court outcomes upon first run).*

---

## 💻 System Modules & Features

### 1. Executive Dashboard
- **Real-Time Statistical Pills**: Active cases, pending review queue, settled cases, total fines collected vs levied.
- **Violation Breakdown**: Visual distribution bars for speeding infractions, red light violations, reckless driving, school zones, and cell phone violations.
- **Workflow Pipeline Tracking**: Monitors case movement from citation issuance to final disposition.
- **Action Required Queue**: Highlights high-severity misdemeanor violations and speed overages.

### 2. Violation Records Directory
- **Search & Multi-Filter**: Real-time filtering by citation number, license plate, offender name, officer badge, location, status, and severity.
- **Plate Display**: Styled legal state license plate tags with vehicle make/model/color details.
- **Speed Over-Limit Telemetry**: Color-coded badges indicating recorded speed vs posted limits (e.g., `89 / 65 mph (+24)`).
- **Interactive Actions**: Direct links to inspect evidence, adjudicate the case, or open a complete 360° dossier.

### 3. Forensic Evidence Review Desk
- **Case Dossier Selector**: Switch between citations to review attached digital evidence items.
- **High-Definition Viewport**: Inspect speed camera night-vision infrared photos, intersection red light stop-bar triggers, LIDAR speed guns, and cruiser dashcam video simulations.
- **Chain of Custody & Cryptographic Hash**: Automatic SHA-256 fingerprint verification ensuring digital assets have not been altered or tampered with.
- **Analyst Adjudication Panel**: Forensic analysts can designate evidentiary strength (`Conclusive`, `Corroborative`, `Circumstantial`) and mark admissibility status (`Verified / Valid`, `Inconclusive`, `Rejected`).
- **Evidence Uploader**: Support for live file uploads (PNG, JPG, MP4, PDF) or selection from standard preset enforcement sensors.

### 4. Case Outcomes & Adjudication Desk
- **Magistrate Hearing Docket**: Formal dispute resolution and administrative hearing desk.
- **Smart Penalty Adjustment**: Automatic penalty calculation based on selected verdict (e.g., 50% mitigation for first-time offenders, total waiver for dismissals).
- **Payment & Settlement Tracking**: Records payment status (`Paid in Full`, `Installment Plan`, `Waived`, `Defaulted`) and bank transaction references.
- **Official Court Disposition Sheet**: Formatted, DMV-compliant printable legal disposition summary complete with magistrate findings of fact and signature lines.

### 5. Audit Trail & Compliance Ledger
- **Tamper-Evident History**: Chronological log of every action taken in the system, noting timestamp, acting officer/analyst/judge, and detailed event descriptions.

---

## 📡 RESTful API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Summary statistics, fine totals, and category breakdowns |
| `GET` | `/api/cases` | List all citations (supports `search`, `status`, `severity`) |
| `POST` | `/api/cases` | Create a new electronic citation record |
| `GET` | `/api/cases/<id>` | Full 360° case dossier with evidence, outcome, and audit logs |
| `PUT` | `/api/cases/<id>` | Update citation details |
| `PATCH` | `/api/cases/<id>/status` | Update case workflow status |
| `POST` | `/api/cases/<id>/evidence` | Upload/attach forensic evidence (multipart or JSON) |
| `PUT` | `/api/evidence/<id>` | Update evidence admissibility review and notes |
| `GET` | `/api/cases/<id>/outcome` | Get formal adjudication outcome |
| `POST` | `/api/cases/<id>/outcome` | Record or update judicial ruling and fine adjustment |
| `POST` | `/api/seed` | Reset demo database with pre-configured sample citations |
