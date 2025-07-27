from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, BackgroundTasks, Header, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import asyncio
from video_processing_pipeline import VideoProcessor
import psycopg2
from psycopg2.extras import RealDictCursor
import firebase_admin
from firebase_admin import credentials, auth
from minio import Minio
import logging
from urllib.parse import urlparse
from dotenv import load_dotenv
import io
from datetime import datetime
from datetime import timedelta
import cv2
import numpy as np
from PIL import Image


load_dotenv("/Users/tewff14/Documents/qmv3/.env")


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="VideoSearch AI Backend", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://tewgg14.totddns.com:64394", "http://tewgg14.totddns.com:64395"],  # Next.js frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin SDK
firebase_service_account_path = "/Users/tewff14/Documents/qmv3/scripts/qmlogin-37712-firebase-adminsdk-fbsvc-bbef8f2663.json"

try:
    if os.path.exists(firebase_service_account_path):
        cred = credentials.Certificate(firebase_service_account_path)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully")
        FIREBASE_ENABLED = True
    else:
        logger.warning(f"Firebase service account file not found at {firebase_service_account_path}")
        logger.warning("Firebase authentication will not work until you add the service account file")
        FIREBASE_ENABLED = False
except Exception as e:
    logger.error(f"Failed to initialize Firebase: {e}")
    logger.warning("Running without Firebase authentication")
    FIREBASE_ENABLED = False

# Initialize services
try:
    video_processor = VideoProcessor()
    logger.info("Video processor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize video processor: {e}")
    video_processor = None

# MinIO client for file storage
try:
    minio_client = Minio(
        os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
        # "tewgg14.totddns.com:64396",
        access_key=os.getenv('MINIO_ACCESS_KEY', 'minioadmin'),
        secret_key=os.getenv('MINIO_SECRET_KEY', 'minioadmin123'),
        secure=os.getenv('MINIO_SECURE', 'false').lower() == 'true'
    )
    logger.info("MinIO client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize MinIO client: {e}")
    minio_client = None

# PostgreSQL connection function
def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    
    if database_url:
        # Parse DATABASE_URL (useful for production deployments like Heroku, Railway)
        url = urlparse(database_url)
        return psycopg2.connect(
            host=url.hostname,
            database=url.path[1:],  # Remove leading slash
            user=url.username,
            password=url.password,
            port=url.port or 5432
        )
    else:
        # Use individual environment variables
        return psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            database=os.getenv('POSTGRES_DB', 'videosearch'),
            user=os.getenv('POSTGRES_USER', 'videosearch'),
            password=os.getenv('POSTGRES_PASSWORD', 'password123'),
            port=int(os.getenv('POSTGRES_PORT', 5432))
        )

# Pydantic models
class VideoUploadResponse(BaseModel):
    video_id: int
    message: str

class VideoInfo(BaseModel):
    id: int
    title: str
    minio_path: str
    thumbnail: str = None
    indexing_status: str
    created_at: datetime

class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 5

class SearchResult(BaseModel):
    video_id: int
    title: str
    similarity: float
    timestamp: float
    frame_number: int

class InVideoSearchResult(BaseModel):
    timestamp: float
    frame_number: int
    similarity: float

# Authentication dependency
async def get_current_user(authorization: Optional[str] = Header(None)):
    logger.info(f"Authorization header: {authorization}")
    
    # For development without Firebase, return a mock user
    # if not FIREBASE_ENABLED:
    #     logger.warning("Firebase not enabled, using mock authentication")
    #     return "mock_user_123"  # Mock user ID for development
    
    if not authorization:
        logger.error("No authorization header provided")
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith('Bearer '):
        logger.error(f"Invalid authorization format: {authorization}")
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = authorization.split(' ')[1]
    logger.info(f"Extracted token: {token[:20]}...")
    
    try:
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        logger.info(f"Successfully authenticated user: {user_id}")
        return user_id
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@app.post("/api/videos/upload", response_model=VideoUploadResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = None,
    user_id: str = Depends(get_current_user)
):
    """Upload a video file and start processing"""
    
    logger.info(f"Upload request from user: {user_id}")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1] if file.filename else '.mp4'
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    minio_path = f"videos/{user_id}/{unique_filename}"
    
    try:
        # Upload to MinIO
        if not minio_client:
            raise HTTPException(status_code=500, detail="File storage not available")
            
        file_data = await file.read()
        minio_client.put_object(
            os.getenv('MINIO_BUCKET_NAME', 'videosearch'),
            minio_path,
            data=io.BytesIO(file_data),  # Wrap bytes in BytesIO
            length=len(file_data),
            content_type=file.content_type
        )
        
        # Create database record (thumbnail is NULL for now)
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                INSERT INTO videos (user_id, title, minio_path, thumbnail, indexing_status)
                VALUES (%s, %s, %s, %s, 'PENDING')
                RETURNING id
                """,
                (user_id, title or file.filename, minio_path, None)
            )
            video_id = cursor.fetchone()['id']
            conn.commit()
        
        conn.close()
        
        # Start background processing (now also does thumbnail extraction)
        if video_processor:
            background_tasks.add_task(process_video_background, video_id, minio_path, user_id)
        
        logger.info(f"Video uploaded successfully: {video_id}")
        return VideoUploadResponse(
            video_id=video_id,
            message="Video uploaded successfully. Processing started."
        )
        
    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload video: {str(e)}")

def extract_and_upload_thumbnail(local_video_path, minio_client, user_id, video_id):
    cap = cv2.VideoCapture(local_video_path)
    ret, frame = cap.read()
    cap.release()
    if not ret:
        return None
    # Convert BGR to RGB and save as JPEG in memory
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(frame_rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format='JPEG')
    buf.seek(0)
    thumbnail_path = f"thumbnails/{user_id}/{video_id}.jpg"
    minio_client.put_object(
        os.getenv('MINIO_BUCKET_NAME', 'videosearch'),
        thumbnail_path,
        data=buf,
        length=buf.getbuffer().nbytes,
        content_type='image/jpeg'
    )
    return thumbnail_path

async def process_video_background(video_id: int, minio_path: str, user_id: str):
    """Background task to process video and extract/upload thumbnail"""
    try:
        logger.info(f"[Index] Starting background processing for video_id={video_id}, minio_path={minio_path}")
        print(f"[Index] Starting background processing for video_id={video_id}, minio_path={minio_path}")

        # Download video from MinIO to temporary file
        temp_file_path = f"/tmp/video_{video_id}.mp4"
        logger.info(f"[Index] Downloading video from MinIO to {temp_file_path}")
        print(f"[Index] Downloading video from MinIO to {temp_file_path}")
        
        # Run the blocking download in a separate thread to avoid freezing the API
        await asyncio.to_thread(
            minio_client.fget_object,
            os.getenv('MINIO_BUCKET_NAME', 'videosearch'), 
            minio_path, 
            temp_file_path
        )

        logger.info(f"[Index] Download complete: {temp_file_path}")
        print(f"[Index] Download complete: {temp_file_path}")

        # Extract and upload thumbnail
        thumbnail_path = await asyncio.to_thread(
            extract_and_upload_thumbnail, temp_file_path, minio_client, user_id, video_id
        )
        if thumbnail_path:
            # Update DB with thumbnail path
            conn = get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE videos SET thumbnail = %s WHERE id = %s",
                    (thumbnail_path, video_id)
                )
                conn.commit()
            conn.close()
            logger.info(f"[Index] Thumbnail uploaded for video_id={video_id}: {thumbnail_path}")
        else:
            logger.warning(f"[Index] Failed to extract thumbnail for video_id={video_id}")

        # Process video
        if video_processor:
            logger.info(f"[Index] Processing video: {temp_file_path}")
            print(f"[Index] Processing video: {temp_file_path}")
            await asyncio.to_thread(video_processor.process_video, video_id, temp_file_path)
            logger.info(f"[Index] Video processing complete for video_id={video_id}")
            print(f"[Index] Video processing complete for video_id={video_id}")
        else:
            logger.warning(f"[Index] Video processor not available for video_id={video_id}")
            print(f"[Index] Video processor not available for video_id={video_id}")

        # Clean up temporary file
        logger.info(f"[Index] Removing temporary file: {temp_file_path}")
        print(f"[Index] Removing temporary file: {temp_file_path}")
        os.remove(temp_file_path)
        logger.info(f"[Index] Temporary file removed: {temp_file_path}")
        print(f"[Index] Temporary file removed: {temp_file_path}")

    except Exception as e:
        logger.error(f"[Index] Error processing video {video_id}: {e}")
        print(f"[Index] Error processing video {video_id}: {e}")

@app.get("/api/videos", response_model=List[VideoInfo])
async def get_user_videos(user_id: str = Depends(get_current_user)):
    """Get all videos for the authenticated user"""
    
    logger.info(f"Fetching videos for user: {user_id}")
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id, title, minio_path, thumbnail, indexing_status, created_at
                FROM videos
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,)
            )
            videos = cursor.fetchall()
        logger.info(f"Found {len(videos)} videos for user {user_id}")
        # Generate presigned URL for thumbnail if exists
        for video in videos:
            if video["thumbnail"]:
                try:
                    video["thumbnail"] = minio_client.presigned_get_object(
                        os.getenv('MINIO_BUCKET_NAME', 'videosearch'),
                        video["thumbnail"],
                        expires=timedelta(hours=1)
                    )
                except Exception as e:
                    logger.warning(f"Failed to generate presigned URL for thumbnail: {e}")
                    video["thumbnail"] = None
        return [VideoInfo(**{**video, "created_at": video["created_at"].isoformat()}) for video in videos]
    except Exception as e:
        logger.error(f"Error fetching videos: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch videos")
    finally:
        conn.close()

@app.get("/api/videos/{video_id}", response_model=VideoInfo)
async def get_video(video_id: int, user_id: str = Depends(get_current_user)):
    """Get specific video information"""
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id, title, minio_path, thumbnail, indexing_status, created_at
                FROM videos
                WHERE id = %s AND user_id = %s
                """,
                (video_id, user_id)
            )
            video = cursor.fetchone()
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        # Generate presigned URL for thumbnail if exists
        if video["thumbnail"]:
            try:
                video["thumbnail"] = minio_client.presigned_get_object(
                    os.getenv('MINIO_BUCKET_NAME', 'videosearch'),
                    video["thumbnail"],
                    expires=timedelta(hours=1)
                )
            except Exception as e:
                logger.warning(f"Failed to generate presigned URL for thumbnail: {e}")
                video["thumbnail"] = None
        return VideoInfo(**video)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch video")
    finally:
        conn.close()

@app.delete("/api/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(video_id: int, user_id: str = Depends(get_current_user)):
    """Delete a video: remove from MinIO, Milvus, and Postgres"""
    # Fetch video info
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT minio_path, thumbnail FROM videos WHERE id = %s AND user_id = %s",
                (video_id, user_id)
            )
            video = cursor.fetchone()
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        minio_path = video["minio_path"]
        thumbnail_path = video["thumbnail"]
    finally:
        conn.close()

    # Delete video file from MinIO
    try:
        minio_client.remove_object(os.getenv('MINIO_BUCKET_NAME', 'videosearch'), minio_path)
    except Exception as e:
        logger.warning(f"Failed to delete video file from MinIO: {e}")
    # Delete thumbnail from MinIO
    if thumbnail_path:
        try:
            minio_client.remove_object(os.getenv('MINIO_BUCKET_NAME', 'videosearch'), thumbnail_path)
        except Exception as e:
            logger.warning(f"Failed to delete thumbnail from MinIO: {e}")
    # Delete frames from Milvus
    try:
        if video_processor:
            video_processor.delete_video_frames(video_id)
    except Exception as e:
        logger.warning(f"Failed to delete frames from Milvus: {e}")
    # Delete from Postgres
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM videos WHERE id = %s AND user_id = %s", (video_id, user_id))
            conn.commit()
    finally:
        conn.close()
    return

@app.post("/api/search/global", response_model=List[SearchResult])
async def global_search(
    request: SearchRequest,
    user_id: str = Depends(get_current_user)
):
    """Perform global semantic search across all user's videos"""
    
    if not video_processor:
        raise HTTPException(status_code=503, detail="Search service not available")
    
    try:
        results = video_processor.search_global(
            query_text=request.query,
            user_id=user_id,
            limit=request.limit
        )
        
        return [SearchResult(**result) for result in results]
        
    except Exception as e:
        logger.error(f"Error in global search: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@app.post("/api/search/video/{video_id}", response_model=List[InVideoSearchResult])
async def search_in_video(
    video_id: int,
    request: SearchRequest,
    user_id: str = Depends(get_current_user)
):
    """Perform semantic search within a specific video"""
    
    # Verify user owns the video
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM videos WHERE id = %s AND user_id = %s AND indexing_status = 'COMPLETED'",
                (video_id, user_id)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Video not found or not ready for search")
    finally:
        conn.close()
    
    if not video_processor:
        raise HTTPException(status_code=503, detail="Search service not available")
    
    try:
        results = video_processor.search_in_video(
            query_text=request.query,
            video_id=video_id,
            limit=request.limit or 10
        )
        
        return [InVideoSearchResult(**result) for result in results]
        
    except Exception as e:
        logger.error(f"Error in video search: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@app.get("/api/videos/{video_id}/stream")
async def stream_video(video_id: int, user_id: str = Depends(get_current_user)):
    """Stream video file from MinIO"""
    
    # Verify user owns the video
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT minio_path FROM videos WHERE id = %s AND user_id = %s",
                (video_id, user_id)
            )
            video = cursor.fetchone()
            
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
            
        if not minio_client:
            raise HTTPException(status_code=500, detail="File storage not available")
            
        # Generate presigned URL for video streaming
        presigned_url = minio_client.presigned_get_object(
            os.getenv('MINIO_BUCKET_NAME', 'videosearch'),
            video['minio_path'],
            expires=timedelta(seconds=3600)  # 1 hour
        )

        print(presigned_url)
        return {"stream_url": presigned_url}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error streaming video: {e}")
        raise HTTPException(status_code=500, detail="Failed to stream video")
    finally:
        conn.close()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy", 
        "message": "VideoSearch AI Backend is running",
        "firebase_enabled": FIREBASE_ENABLED,
        "services": {
            "video_processor": video_processor is not None,
            "minio": minio_client is not None
        }
    }

# Debug endpoint to test authentication
@app.get("/api/auth/test")
async def test_auth(user_id: str = Depends(get_current_user)):
    """Test authentication endpoint"""
    return {
        "message": "Authentication successful",
        "user_id": user_id,
        "firebase_enabled": FIREBASE_ENABLED
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
