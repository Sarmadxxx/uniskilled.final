-- Exported from the live database migration history (20260606201545 01_extensions_and_enums).

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('student', 'tutor', 'business', 'admin');
CREATE TYPE session_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'disputed', 'no_show');
CREATE TYPE order_status AS ENUM ('pending', 'active', 'delivered', 'approved', 'disputed', 'cancelled');
CREATE TYPE job_status AS ENUM ('draft', 'live', 'closed', 'flagged');
CREATE TYPE job_type AS ENUM ('freelance', 'internship', 'part_time', 'full_time');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved');
CREATE TYPE dispute_resolution AS ENUM ('released', 'refunded', 'partial', 'suspended');
CREATE TYPE credential_type AS ENUM ('developer', 'tutor', 'designer', 'data_analyst', 'marketer', 'writer', 'other');
CREATE TYPE cancellation_by AS ENUM ('student', 'tutor', 'business', 'admin', 'system');
CREATE TYPE attachment_type AS ENUM ('image', 'file', 'pdf');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE subscription_plan AS ENUM ('free', 'growth', 'pro', 'enterprise');
CREATE TYPE setting_type AS ENUM ('bool', 'int', 'decimal', 'string');
CREATE TYPE audit_target_type AS ENUM (
  'user', 'session', 'order', 'job', 'dispute',
  'payment', 'credential', 'review', 'message',
  'platform_settings', 'verification'
);
