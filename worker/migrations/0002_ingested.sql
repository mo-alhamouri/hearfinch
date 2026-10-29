-- Which subtitle files are already in the index, so the indexer (which can
-- run on GitHub Actions with no local copy) never downloads them twice.
CREATE TABLE IF NOT EXISTS ingested (source_key TEXT PRIMARY KEY);
