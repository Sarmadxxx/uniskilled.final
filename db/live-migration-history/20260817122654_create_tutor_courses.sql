-- Exported from the live database migration history (20260817122654 create_tutor_courses).

CREATE TABLE tutor_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  course_name text,
  professor_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tutor_courses_tutor ON tutor_courses(tutor_id);
CREATE INDEX idx_tutor_courses_code ON tutor_courses(lower(course_code));

GRANT ALL ON tutor_courses TO service_role, authenticated;
GRANT SELECT ON tutor_courses TO anon;
