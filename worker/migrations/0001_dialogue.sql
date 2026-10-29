-- Dialogue index for movies and TV.
-- Only titles are stored: TV episodes are filed under their series, so a
-- match can never reveal a scene, episode or timestamp.

CREATE TABLE IF NOT EXISTS titles (
  id         INTEGER PRIMARY KEY,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT    NOT NULL CHECK (media_type IN ('movie', 'tv')),
  imdb_id    TEXT,
  title      TEXT    NOT NULL,
  year       INTEGER,
  source     TEXT    NOT NULL,
  sources    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (media_type, tmdb_id)
);

-- ~40-word overlapping windows of dialogue, full-text searchable.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  text,
  title_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
