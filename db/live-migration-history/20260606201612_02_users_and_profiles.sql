-- Exported from the live database migration history (20260606201612 02_users_and_profiles).

-- Core users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id                          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                       VARCHAR(255) UNIQUE NOT NULL,
  full_name                   VARCHAR(255),
  avatar_url                  VARCHAR(500),
  cover_url                   VARCHAR(500),
  roles                       user_role[] NOT NULL DEFAULT ARRAY['student']::user_role[],
  timezone                    VARCHAR(100) DEFAULT 'UTC',
  language                    VARCHAR(10) DEFAULT 'en',
  bio                         TEXT,
  phone                       VARCHAR(50),
  country                     VARCHAR(100),
  city                        VARCHAR(100),
  website_url                 VARCHAR(500),
  linkedin_url                VARCHAR(500),
  github_url                  VARCHAR(500),
  -- Verification
  email_verified              BOOLEAN DEFAULT FALSE,
  email_verified_at           TIMESTAMP WITH TIME ZONE,
  university_email            VARCHAR(255),
  university_email_verified   BOOLEAN DEFAULT FALSE,
  -- Legal consent (GDPR)
  privacy_policy_accepted_at  TIMESTAMP WITH TIME ZONE,
  terms_accepted_at           TIMESTAMP WITH TIME ZONE,
  cookie_consent              BOOLEAN DEFAULT FALSE,
  cookie_consent_at           TIMESTAMP WITH TIME ZONE,
  -- Account status
  suspended_at                TIMESTAMP WITH TIME ZONE,
  suspended_reason            TEXT,
  suspended_by                UUID REFERENCES public.users(id),
  warning_count               INT DEFAULT 0,
  -- Stripe
  stripe_customer_id          VARCHAR(255),
  -- Timestamps
  last_seen_at                TIMESTAMP WITH TIME ZONE,
  created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student profiles
CREATE TABLE public.student_profiles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  university        VARCHAR(255),
  degree            VARCHAR(255),
  major             VARCHAR(255),
  year_of_study     INT,
  graduation_year   INT,
  skills            TEXT[] DEFAULT ARRAY[]::TEXT[],
  hourly_rate       DECIMAL(8,2),
  currency          VARCHAR(3) DEFAULT 'EUR',
  availability      TEXT,
  cv_url            VARCHAR(500),
  portfolio_url     VARCHAR(500),
  portfolio_files   TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_available      BOOLEAN DEFAULT TRUE,
  total_orders      INT DEFAULT 0,
  total_earnings    DECIMAL(10,2) DEFAULT 0,
  rating_avg        DECIMAL(3,2) DEFAULT 0,
  review_count      INT DEFAULT 0,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor profiles
CREATE TABLE public.tutor_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bio                 TEXT,
  subjects            TEXT[] DEFAULT ARRAY[]::TEXT[],
  teaching_levels     TEXT[] DEFAULT ARRAY[]::TEXT[],
  hourly_rate         DECIMAL(8,2),
  currency            VARCHAR(3) DEFAULT 'EUR',
  languages           TEXT[] DEFAULT ARRAY[]::TEXT[],
  format              VARCHAR(50) DEFAULT 'both', -- 'online' | 'in_person' | 'both'
  location            VARCHAR(255),
  teaching_style      TEXT,
  materials_url       TEXT[] DEFAULT ARRAY[]::TEXT[],
  video_link          VARCHAR(500), -- default zoom/meet link
  -- Stats
  rating_avg          DECIMAL(3,2) DEFAULT 0,
  review_count        INT DEFAULT 0,
  sessions_count      INT DEFAULT 0,
  response_rate       DECIMAL(5,2) DEFAULT 0,
  completion_rate     DECIMAL(5,2) DEFAULT 0,
  no_show_count       INT DEFAULT 0,
  total_earnings      DECIMAL(10,2) DEFAULT 0,
  -- Verification badges
  university_verified_at   TIMESTAMP WITH TIME ZONE,
  grade_verified_at        TIMESTAMP WITH TIME ZONE,
  certified_at             TIMESTAMP WITH TIME ZONE,  -- UniSkilled Certified badge
  top_rated_at             TIMESTAMP WITH TIME ZONE,  -- Top Rated badge
  -- Availability
  next_available      DATE,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business profiles
CREATE TABLE public.business_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_name          VARCHAR(255),
  industry              VARCHAR(100),
  company_size          VARCHAR(50),
  founded_year          INT,
  city                  VARCHAR(100),
  country               VARCHAR(100),
  website_url           VARCHAR(500),
  linkedin_url          VARCHAR(500),
  description           TEXT,
  tech_stack            TEXT[] DEFAULT ARRAY[]::TEXT[],
  logo_url              VARCHAR(500),
  cover_url             VARCHAR(500),
  -- Subscription
  plan                  subscription_plan DEFAULT 'free',
  plan_started_at       TIMESTAMP WITH TIME ZONE,
  plan_expires_at       TIMESTAMP WITH TIME ZONE,
  stripe_subscription_id VARCHAR(255),
  -- Stats
  total_hires           INT DEFAULT 0,
  total_spent           DECIMAL(10,2) DEFAULT 0,
  rating_avg            DECIMAL(3,2) DEFAULT 0,
  review_count          INT DEFAULT 0,
  on_time_payment_rate  DECIMAL(5,2) DEFAULT 100,
  -- Verification
  verified_at           TIMESTAMP WITH TIME ZONE,
  verified_by           UUID REFERENCES public.users(id),
  employer_score        INT DEFAULT 0,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor weekly availability
CREATE TABLE public.tutor_availability (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id        UUID NOT NULL REFERENCES public.tutor_profiles(id) ON DELETE CASCADE,
  day_of_week     INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon, 6=Sun
  start_time_utc  TIME NOT NULL,
  end_time_utc    TIME NOT NULL,
  is_recurring    BOOLEAN DEFAULT TRUE,
  effective_from  DATE DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tutor verification documents
CREATE TABLE public.tutor_verifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id        UUID NOT NULL REFERENCES public.tutor_profiles(id) ON DELETE CASCADE,
  document_type   VARCHAR(100), -- 'student_id' | 'transcript' | 'grade_sheet'
  document_url    VARCHAR(500) NOT NULL,
  status          verification_status DEFAULT 'pending',
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  submitted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
