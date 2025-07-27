-- Create the videos table for storing video metadata
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL, -- Firebase UID
    title VARCHAR(255) NOT NULL,
    minio_path VARCHAR(1024) NOT NULL,
    thumbnail VARCHAR(1024), -- Path or URL to the thumbnail image
    indexing_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, INDEXING, COMPLETED, FAILED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);

-- Create index on indexing_status for filtering
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(indexing_status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_videos_updated_at 
    BEFORE UPDATE ON videos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
