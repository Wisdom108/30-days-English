-- Lesson-level spaced review: the client reports the earliest due timestamp of
-- its review ladder alongside each progress push. A plain queryable column so
-- the push crons can prioritize due subscribers with one JOIN — never by
-- parsing the opaque progress blob per user (subrequest budget).
ALTER TABLE progress ADD COLUMN next_review_at INTEGER;
