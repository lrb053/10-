CREATE TABLE IF NOT EXISTS users (
    line_user_id TEXT PRIMARY KEY,
    display_name TEXT,
    picture_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,

    sender_line_user_id TEXT NOT NULL,

    card_id INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    opened_at TEXT,

    opened_by_line_user_id TEXT,

    FOREIGN KEY (sender_line_user_id)
        REFERENCES users(line_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shares_sender
ON shares(sender_line_user_id);

CREATE INDEX IF NOT EXISTS idx_shares_card
ON shares(sender_line_user_id, card_id);

CREATE INDEX IF NOT EXISTS idx_shares_opened
ON shares(opened_at);
