-- DentaNueva patient and clinical record schema
-- Run this once in dental_clinic_system. Existing tbl_users is preserved.

-- The authentication code depends on this table. This definition is only
-- created when an installation does not already have tbl_users.
CREATE TABLE IF NOT EXISTS tbl_users (
    user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    firstname VARCHAR(100) NOT NULL,
    lastname VARCHAR(100) NOT NULL,
    name VARCHAR(201) NOT NULL,
    email VARCHAR(190) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'user',
    department VARCHAR(100) NULL,
    staff_id VARCHAR(30) NULL,
    doctor_id VARCHAR(30) NULL,
    specialization VARCHAR(150) NULL,
    access_level VARCHAR(30) NOT NULL DEFAULT 'user',
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    profile_image VARCHAR(255) NULL,
    contact VARCHAR(30) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_tbl_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tbl_users
    MODIFY role ENUM('user','staff','doctor') NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS tbl_patients (
    patient_id VARCHAR(20) NOT NULL,
    user_id INT UNSIGNED NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NULL,
    gender VARCHAR(30) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(190) NULL,
    address VARCHAR(255) NULL,
    emergency_name VARCHAR(150) NULL,
    emergency_contact VARCHAR(30) NULL,
    patient_type ENUM('registered','walk_in') NOT NULL DEFAULT 'walk_in',
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (patient_id),
    UNIQUE KEY uq_tbl_patients_user_id (user_id),
    KEY idx_tbl_patients_name (last_name, first_name),
    CONSTRAINT fk_tbl_patients_user FOREIGN KEY (user_id) REFERENCES tbl_users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_tbl_patients_created_by FOREIGN KEY (created_by) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_medical_forms (
    medical_form_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(20) NOT NULL,
    dental_concern JSON NULL,
    dental_concern_other VARCHAR(255) NULL,
    negative_experience VARCHAR(10) NULL,
    negative_experience_note TEXT NULL,
    last_dental_visit DATE NULL,
    last_dental_treatment TEXT NULL,
    current_medications VARCHAR(10) NULL,
    current_medications_list TEXT NULL,
    medical_history JSON NULL,
    medical_other VARCHAR(255) NULL,
    allergies JSON NULL,
    allergy_other VARCHAR(255) NULL,
    consent TINYINT(1) NOT NULL DEFAULT 0,
    completed TINYINT(1) NOT NULL DEFAULT 0,
    submitted_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (medical_form_id),
    UNIQUE KEY uq_tbl_medical_forms_patient (patient_id),
    CONSTRAINT fk_tbl_medical_forms_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_tbl_medical_forms_submitter FOREIGN KEY (submitted_by) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_patient_appointments (
    appointment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    appointment_uid VARCHAR(80) NULL,
    patient_id VARCHAR(20) NOT NULL,
    doctor_id INT UNSIGNED NULL,
    appointment_date DATE NULL,
    appointment_time TIME NULL,
    service_type VARCHAR(150) NOT NULL DEFAULT 'Dental Appointment',
    duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    checked_in TINYINT(1) NOT NULL DEFAULT 0,
    checked_in_at DATETIME NULL,
    consultation_started TINYINT(1) NOT NULL DEFAULT 0,
    manual_ready_complete TINYINT(1) NOT NULL DEFAULT 0,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
    payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    cancelled_at DATETIME NULL,
    reason VARCHAR(255) NULL,
    notes TEXT NULL,
    metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (appointment_id),
    UNIQUE KEY uq_appointments_uid (appointment_uid),
    KEY idx_appointments_patient (patient_id),
    CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Apply the appointment fields to installations created before this schema update.
ALTER TABLE tbl_patient_appointments
    ADD COLUMN IF NOT EXISTS appointment_uid VARCHAR(80) NULL AFTER appointment_id,
    ADD COLUMN IF NOT EXISTS service_type VARCHAR(150) NOT NULL DEFAULT 'Dental Appointment' AFTER appointment_time,
    ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER service_type,
    ADD COLUMN IF NOT EXISTS checked_in TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN IF NOT EXISTS checked_in_at DATETIME NULL AFTER checked_in,
    ADD COLUMN IF NOT EXISTS consultation_started TINYINT(1) NOT NULL DEFAULT 0 AFTER checked_in_at,
    ADD COLUMN IF NOT EXISTS manual_ready_complete TINYINT(1) NOT NULL DEFAULT 0 AFTER consultation_started,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' AFTER manual_ready_complete,
    ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER payment_status,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER payment_amount,
    ADD COLUMN IF NOT EXISTS metadata JSON NULL AFTER notes;

ALTER TABLE tbl_patient_appointments
    ADD UNIQUE KEY IF NOT EXISTS uq_appointments_uid (appointment_uid);

CREATE TABLE IF NOT EXISTS tbl_finance_transactions (
    transaction_id VARCHAR(80) NOT NULL,
    patient_id VARCHAR(20) NOT NULL,
    invoice_number VARCHAR(80) NULL,
    service VARCHAR(150) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_time TIME NULL,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount DECIMAL(10,2) NOT NULL DEFAULT 0,
    paid DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    payment_history JSON NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id),
    KEY idx_finance_patient (patient_id),
    KEY idx_finance_date (transaction_date),
    CONSTRAINT fk_finance_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_finance_creator FOREIGN KEY (created_by) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_staff_notifications (
    notification_id VARCHAR(100) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    payload JSON NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id),
    KEY idx_staff_notifications_type (notification_type),
    CONSTRAINT fk_staff_notifications_creator FOREIGN KEY (created_by) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_reschedule_requests (
    reschedule_request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    appointment_id BIGINT UNSIGNED NOT NULL,
    patient_id VARCHAR(20) NOT NULL,
    request_id VARCHAR(80) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    requested_by ENUM('patient','staff','doctor') NOT NULL DEFAULT 'patient',
    reason VARCHAR(80) NULL,
    reason_label VARCHAR(120) NULL,
    message TEXT NULL,
    current_sched_date DATE NULL,
    current_sched_time TIME NULL,
    preferred_date DATE NULL,
    preferred_time TIME NULL,
    approved_date DATE NULL,
    approved_time TIME NULL,
    patient_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
    patient_acknowledged_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (reschedule_request_id),
    UNIQUE KEY uq_tbl_reschedule_request_id (request_id),
    KEY idx_reschedule_appointment (appointment_id),
    KEY idx_reschedule_patient_status (patient_id, status),
    CONSTRAINT fk_reschedule_appointment FOREIGN KEY (appointment_id) REFERENCES tbl_patient_appointments(appointment_id) ON DELETE CASCADE,
    CONSTRAINT fk_reschedule_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tbl_reschedule_requests
    ADD COLUMN IF NOT EXISTS patient_acknowledged TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_time,
    ADD COLUMN IF NOT EXISTS patient_acknowledged_at DATETIME NULL AFTER patient_acknowledged;

CREATE TABLE IF NOT EXISTS tbl_patient_treatments (
    treatment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(20) NOT NULL,
    doctor_id INT UNSIGNED NULL,
    appointment_id BIGINT UNSIGNED NULL,
    tooth_number VARCHAR(10) NULL,
    procedure_name VARCHAR(150) NOT NULL,
    treatment_date DATE NULL,
    notes TEXT NULL,
    consumed_materials JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (treatment_id),
    KEY idx_treatments_patient (patient_id),
    CONSTRAINT fk_treatments_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_treatments_doctor FOREIGN KEY (doctor_id) REFERENCES tbl_users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_treatments_appointment FOREIGN KEY (appointment_id) REFERENCES tbl_patient_appointments(appointment_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_dental_chart (
    dental_chart_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(20) NOT NULL,
    doctor_id INT UNSIGNED NULL,
    tooth_number VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(150) NULL,
    notes TEXT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dental_chart_id),
    KEY idx_dental_chart_patient (patient_id),
    CONSTRAINT fk_dental_chart_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_dental_chart_doctor FOREIGN KEY (doctor_id) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tbl_clinical_images (
    image_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    patient_id VARCHAR(20) NOT NULL,
    doctor_id INT UNSIGNED NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    before_image VARCHAR(255) NULL,
    after_image VARCHAR(255) NULL,
    image_date DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id),
    KEY idx_clinical_images_patient (patient_id),
    CONSTRAINT fk_clinical_images_patient FOREIGN KEY (patient_id) REFERENCES tbl_patients(patient_id) ON DELETE CASCADE,
    CONSTRAINT fk_clinical_images_doctor FOREIGN KEY (doctor_id) REFERENCES tbl_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing installations may have the original Base64 columns. Image files are stored on disk;
-- these columns keep only their relative paths.
ALTER TABLE tbl_clinical_images
    MODIFY before_image VARCHAR(255) NULL,
    MODIFY after_image VARCHAR(255) NULL;

-- Link existing registered accounts to a stable patient record.
INSERT INTO tbl_patients (patient_id, user_id, first_name, last_name, email, patient_type, created_by)
SELECT CONCAT('PN-', LPAD(u.user_id, 4, '0')), u.user_id,
       COALESCE(u.firstname, ''), COALESCE(u.lastname, ''), u.email, 'registered', u.user_id
FROM tbl_users u
LEFT JOIN tbl_patients p ON p.user_id = u.user_id
WHERE LOWER(COALESCE(u.role, '')) = 'user' AND p.patient_id IS NULL;