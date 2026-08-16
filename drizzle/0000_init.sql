-- Schema for Bruin Seat Watch.
-- Kept as plain SQL so the same file initialises both a real Postgres and the
-- PGlite fallback. Once the project is real, replace this with drizzle-kit
-- generated migrations.

CREATE TABLE IF NOT EXISTS subject_area (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course (
  id SERIAL PRIMARY KEY,
  subject_code TEXT NOT NULL REFERENCES subject_area(code),
  number TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS course_subject_number_idx
  ON course (subject_code, number);

CREATE TABLE IF NOT EXISTS section (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course(id),
  term TEXT NOT NULL,
  class_id TEXT NOT NULL,
  activity TEXT NOT NULL,
  instructor TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS section_term_class_idx
  ON section (term, class_id);

CREATE TABLE IF NOT EXISTS enrollment_snapshot (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES section(id),
  captured_at TIMESTAMPTZ NOT NULL,
  seats_total INTEGER NOT NULL,
  seats_taken INTEGER NOT NULL,
  waitlist_total INTEGER NOT NULL,
  waitlist_taken INTEGER NOT NULL,
  status TEXT NOT NULL
);

-- Every read is "one section over a time range". Without this index the table
-- scan becomes the bottleneck within a few weeks of scraping.
CREATE INDEX IF NOT EXISTS snapshot_section_time_idx
  ON enrollment_snapshot (section_id, captured_at);
