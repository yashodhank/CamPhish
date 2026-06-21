use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;

pub async fn init_pool(url: &str) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> anyhow::Result<()> {
    let sql = include_str!("../migrations/001_init.sql");
    sqlx::raw_sql(sql).execute(pool).await?;

    // Column additions — safe to rerun (SQLite ignores ALTER TABLE if column exists)
    for stmt in [
        "ALTER TABLE locations ADD COLUMN address TEXT",
        "ALTER TABLE ip_logs ADD COLUMN city TEXT",
        "ALTER TABLE ip_logs ADD COLUMN country TEXT",
        "ALTER TABLE ip_logs ADD COLUMN geo_data TEXT",
        "ALTER TABLE ip_logs ADD COLUMN languages TEXT",
        "ALTER TABLE ip_logs ADD COLUMN cookie_enabled INTEGER",
        "ALTER TABLE ip_logs ADD COLUMN do_not_track TEXT",
        "ALTER TABLE ip_logs ADD COLUMN voice_languages TEXT",
        "ALTER TABLE storage_dumps ADD COLUMN ip_address TEXT",
        "CREATE INDEX IF NOT EXISTS idx_storage_created ON storage_dumps(created_at DESC)",
    ] {
        let _ = sqlx::raw_sql(stmt).execute(pool).await;
    }

    sqlx::raw_sql("PRAGMA wal_checkpoint(TRUNCATE)").execute(pool).await?;
    tracing::info!("Database migrations applied, WAL checkpointed");
    Ok(())
}
