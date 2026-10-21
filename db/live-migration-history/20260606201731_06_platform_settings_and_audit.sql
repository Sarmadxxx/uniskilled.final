-- Exported from the live database migration history (20260606201731 06_platform_settings_and_audit).

-- Platform settings (feature flags + fee config)
CREATE TABLE public.platform_settings (
  key           VARCHAR(100) PRIMARY KEY,
  value         TEXT NOT NULL,
  type          setting_type NOT NULL DEFAULT 'string',
  description   TEXT,
  updated_by    UUID REFERENCES public.users(id),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed all default settings from the brief
INSERT INTO public.platform_settings (key, value, type, description) VALUES
  ('tutoring_enabled',                  'true',  'bool',    'Enables the tutoring marketplace'),
  ('freelance_enabled',                 'false', 'bool',    'Enables the freelance/jobs marketplace'),
  ('business_registration_enabled',     'false', 'bool',    'Allows new businesses to register'),
  ('credential_system_enabled',         'true',  'bool',    'Enables credential issuance'),
  ('ai_matching_enabled',               'true',  'bool',    'Returns AI match scores in API responses'),
  ('messaging_enabled',                 'true',  'bool',    'Enables the messaging system'),
  ('grad_pipeline_enabled',             'true',  'bool',    'Enables the hire-to-graduate pipeline feature'),
  ('maintenance_mode',                  'false', 'bool',    'Takes the site offline for all non-admin users'),
  ('tutor_fee_pct',                     '20',    'int',     'Platform fee percentage deducted from tutors'),
  ('freelance_fee_pct',                 '15',    'int',     'Platform fee percentage deducted from freelance students'),
  ('business_order_fee_pct',            '5',     'int',     'Order fee percentage charged to businesses on the Free plan'),
  ('student_booking_fee',               '1.50',  'decimal', 'Flat booking fee added to each tutoring session checkout'),
  ('free_first_session',                'true',  'bool',    'First session and first order are free of platform fee for new users'),
  ('session_cancel_threshold_full',     '24',    'int',     'Hours before session — student gets 100% refund'),
  ('session_cancel_threshold_half',     '2',     'int',     'Hours before session — student gets 50% refund'),
  ('auto_release_days',                 '7',     'int',     'Days after delivery before escrow is auto-released'),
  ('min_tutor_rate',                    '10',    'decimal', 'Minimum allowed hourly rate for tutors in EUR'),
  ('max_tutor_rate',                    '500',   'decimal', 'Maximum allowed hourly rate for tutors in EUR'),
  ('review_edit_days',                  '14',    'int',     'Days after creation that a review can be edited'),
  ('no_show_suspension_threshold',      '3',     'int',     'Number of no-shows before admin review is triggered'),
  ('whistleblower_credit_amount',       '25.00', 'decimal', 'Credit amount awarded for confirmed off-platform reports');

-- Audit logs
CREATE TABLE public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id      UUID NOT NULL REFERENCES public.users(id),
  action        VARCHAR(255) NOT NULL,
  target_type   audit_target_type NOT NULL,
  target_id     UUID NOT NULL,
  target_email  VARCHAR(255), -- denormalised for easy log reading
  details       JSONB DEFAULT '{}'::JSONB,
  ip_address    VARCHAR(50),
  user_agent    TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform announcements (sent by admin)
CREATE TABLE public.announcements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(255) NOT NULL,
  body          TEXT NOT NULL,
  audience      VARCHAR(50) DEFAULT 'all', -- 'all' | 'students' | 'tutors' | 'businesses'
  sent_by       UUID NOT NULL REFERENCES public.users(id),
  sent_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recipient_count INT DEFAULT 0
);

-- Admin warnings issued to users
CREATE TABLE public.user_warnings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  issued_by     UUID NOT NULL REFERENCES public.users(id),
  reason        TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
