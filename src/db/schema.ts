import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// A subject area, for example "COM SCI" or "MATH".
export const subjectAreas = pgTable("subject_area", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

// A course, for example COM SCI 32.
export const courses = pgTable(
  "course",
  {
    id: serial("id").primaryKey(),
    subjectCode: text("subject_code")
      .notNull()
      .references(() => subjectAreas.code),
    number: text("number").notNull(),
    title: text("title").notNull(),
  },
  (t) => [uniqueIndex("course_subject_number_idx").on(t.subjectCode, t.number)],
);

// One offered section in one term, for example COM SCI 32 Lec 1, Fall 2026.
export const sections = pgTable(
  "section",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id),
    term: text("term").notNull(),
    // UCLA's own identifier for the section. Used to dedupe across scrapes.
    classId: text("class_id").notNull(),
    activity: text("activity").notNull(),
    instructor: text("instructor"),
  },
  (t) => [uniqueIndex("section_term_class_idx").on(t.term, t.classId)],
);

// One observation of one section at one moment. This is the whole point of the
// project: nobody else is storing this, so the history is ours.
export const enrollmentSnapshots = pgTable(
  "enrollment_snapshot",
  {
    id: serial("id").primaryKey(),
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    seatsTotal: integer("seats_total").notNull(),
    seatsTaken: integer("seats_taken").notNull(),
    waitlistTotal: integer("waitlist_total").notNull(),
    waitlistTaken: integer("waitlist_taken").notNull(),
    status: text("status").notNull(),
  },
  // Every read is "one section over a time range", so this is the index that
  // matters. Without it the table scan gets slow within weeks.
  (t) => [index("snapshot_section_time_idx").on(t.sectionId, t.capturedAt)],
);

export type Section = typeof sections.$inferSelect;
export type EnrollmentSnapshot = typeof enrollmentSnapshots.$inferSelect;
