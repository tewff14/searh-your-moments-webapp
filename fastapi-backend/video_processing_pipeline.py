import cv2
import numpy as np
import torch
from PIL import Image
import clip
import asyncio
import aiofiles
from minio import Minio
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging
from typing import List, Tuple, Dict
import json
from urllib.parse import urlparse
from dotenv import load_dotenv


load_dotenv("/Users/tewff14/Documents/qmv3/.env")


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PostgreSQL connection - support both individual vars and DATABASE_URL
def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    
    if database_url:
        # Parse DATABASE_URL (useful for production deployments)
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
            user=os.getenv('POSTGRES_USER'),
            password=os.getenv('POSTGRES_PASSWORD'),
            port=os.getenv('POSTGRES_PORT', 5432)
        )

class VideoProcessor:
    def __init__(self):
        # Initialize CLIP model
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model, self.preprocess = clip.load("ViT-B/32", device=self.device)
        
        # Initialize MinIO client
        self.minio_client = Minio(
            os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
            access_key=os.getenv('MINIO_ACCESS_KEY'),
            secret_key=os.getenv('MINIO_SECRET_KEY'),
            secure=False
        )
        
        # Initialize PostgreSQL connection using the function
        self.pg_conn = get_db_connection()
        
        # Initialize Milvus connection
        connections.connect("default", host=os.getenv('MILVUS_HOST', 'localhost'), port="19530")
        self.setup_milvus_collection()
    
    def setup_milvus_collection(self):
        """Setup Milvus collection for storing video frame embeddings"""
        collection_name = "video_frames"

        if not utility.has_collection(collection_name):
            # If collection doesn't exist, create it
            fields = [
                FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
                FieldSchema(name="video_id", dtype=DataType.INT64),
                FieldSchema(name="frame_number", dtype=DataType.INT64),
                FieldSchema(name="timestamp_sec", dtype=DataType.FLOAT),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512)
            ]
            schema = CollectionSchema(fields, "Video frame embeddings collection")
            self.collection = Collection(name=collection_name, schema=schema)
            logger.info(f"Created new Milvus collection: '{collection_name}'")

            # Create index after creating collection
            index_params = {
                "metric_type": "COSINE",
                "index_type": "IVF_FLAT",
                "params": {"nlist": 128}
            }
            self.collection.create_index("embedding", index_params)
            logger.info("Created index on 'embedding' field.")
        else:
            # If collection exists, just connect to it
            self.collection = Collection(collection_name)
            logger.info(f"Connected to existing Milvus collection: '{collection_name}'")

        self.collection.load()
        logger.info(f"Collection '{collection_name}' loaded.")
    
    def extract_frames(self, video_path: str, fps: float = 1.0) -> List[Tuple[np.ndarray, float]]:
        """Extract frames from video at specified FPS"""
        cap = cv2.VideoCapture(video_path)
        frames = []
        
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(video_fps / fps)
        
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % frame_interval == 0:
                timestamp = frame_count / video_fps
                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append((frame_rgb, timestamp))
            
            frame_count += 1
        
        cap.release()
        logger.info(f"Extracted {len(frames)} frames from video")
        return frames
    
    def generate_embeddings_batch(self, frames: List[np.ndarray]) -> np.ndarray:
        """Generate CLIP embeddings for a batch of frames"""
        # Preprocess frames
        images = []
        for frame in frames:
            pil_image = Image.fromarray(frame)
            preprocessed = self.preprocess(pil_image)
            images.append(preprocessed)
        
        # Stack into batch tensor
        image_batch = torch.stack(images).to(self.device)
        
        # Generate embeddings
        with torch.no_grad():
            embeddings = self.model.encode_image(image_batch)
            embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)  # Normalize
        
        return embeddings.cpu().numpy()
    
    def process_video(self, video_id: int, video_path: str):
        """Main video processing pipeline"""
        try:
            # Update status to INDEXING
            self.update_video_status(video_id, 'INDEXING')
            
            # Extract frames
            frames_data = self.extract_frames(video_path, fps=1.0)
            if not frames_data:
                logger.error(f"No frames extracted from video {video_path}")
                self.update_video_status(video_id, 'FAILED')
                return
            frames = [frame for frame, _ in frames_data]
            timestamps = [timestamp for _, timestamp in frames_data]
            
            # Process frames in batches
            batch_size = 32
            all_embeddings = []
            
            for i in range(0, len(frames), batch_size):
                batch_frames = frames[i:i + batch_size]
                batch_embeddings = self.generate_embeddings_batch(batch_frames)
                all_embeddings.extend(batch_embeddings)
                
                logger.info(f"Processed batch {i//batch_size + 1}/{(len(frames) + batch_size - 1)//batch_size}")
            
            # Store embeddings in Milvus
            self.store_embeddings(video_id, all_embeddings, timestamps)
            
            # Update status to COMPLETED
            self.update_video_status(video_id, 'COMPLETED')
            logger.info(f"Successfully processed video {video_id}")
            
        except Exception as e:
            logger.error(f"Error processing video {video_id}: {e}")
            self.update_video_status(video_id, 'FAILED')
            raise
    
    def store_embeddings(self, video_id: int, embeddings: List[np.ndarray], timestamps: List[float]):
        """Store embeddings in Milvus"""
        if not embeddings:
            logger.error(f"No embeddings to store for video {video_id}")
            return
        data = [
            [video_id] * len(embeddings),  # video_id
            list(range(len(embeddings))),  # frame_number
            timestamps,  # timestamp_sec
            embeddings  # embedding
        ]
        
        self.collection.insert(data)
        self.collection.flush()
        logger.info(f"Stored {len(embeddings)} embeddings for video {video_id}")
    
    def update_video_status(self, video_id: int, status: str):
        """Update video indexing status in PostgreSQL"""
        with self.pg_conn.cursor() as cursor:
            cursor.execute(
                "UPDATE videos SET indexing_status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                (status, video_id)
            )
            self.pg_conn.commit()
    
    def search_global(self, query_text: str, user_id: str, limit: int = 5) -> List[Dict]:
        """Perform global semantic search across all user's videos"""
        # Generate query embedding
        text_tokens = clip.tokenize([query_text]).to(self.device)
        with torch.no_grad():
            query_embedding = self.model.encode_text(text_tokens)
            query_embedding = query_embedding / query_embedding.norm(dim=-1, keepdim=True)
        
        query_vector = query_embedding.cpu().numpy().flatten().tolist()
        
        # Get user's completed videos
        with self.pg_conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, title FROM videos WHERE user_id = %s AND indexing_status = 'COMPLETED'",
                (user_id,)
            )
            user_videos = cursor.fetchall()
        
        if not user_videos:
            return []
        
        video_ids = [video['id'] for video in user_videos]
        
        # Search in Milvus
        search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
        
        # Search for each video and get the best match
        results = []
        for video_id in video_ids:
            # Filter by video_id
            expr = f"video_id == {video_id}"
            
            search_results = self.collection.search(
                data=[query_vector],
                anns_field="embedding",
                param=search_params,
                limit=1,
                expr=expr,
                output_fields=["video_id", "frame_number", "timestamp_sec"]
            )
            
            if search_results[0]:
                hit = search_results[0][0]
                video_info = next(v for v in user_videos if v['id'] == video_id)
                
                results.append({
                    'video_id': video_id,
                    'title': video_info['title'],
                    'similarity': float(hit.score),
                    'timestamp': float(hit.entity.get('timestamp_sec')),
                    'frame_number': int(hit.entity.get('frame_number'))
                })
        
        # Sort by similarity and return top results
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:limit]
    
    def search_in_video(self, query_text: str, video_id: int, limit: int = 10) -> List[Dict]:
        """Perform semantic search within a specific video"""
        # Generate query embedding
        text_tokens = clip.tokenize([query_text]).to(self.device)
        with torch.no_grad():
            query_embedding = self.model.encode_text(text_tokens)
            query_embedding = query_embedding / query_embedding.norm(dim=-1, keepdim=True)
        
        query_vector = query_embedding.cpu().numpy().flatten().tolist()
        
        # Search in Milvus for specific video
        search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
        expr = f"video_id == {video_id}"
        
        self.collection.load() # <-- Add this line
        search_results = self.collection.search(
            data=[query_vector],
            anns_field="embedding",
            param=search_params,
            limit=limit,
            expr=expr,
            output_fields=["video_id", "frame_number", "timestamp_sec"]
        )
        
        results = []
        if search_results[0]:
            for hit in search_results[0]:
                results.append({
                    'timestamp': float(hit.entity.get('timestamp_sec')),
                    'frame_number': int(hit.entity.get('frame_number')),
                    'similarity': float(hit.score)
                })
        
        return results

    def delete_video_frames(self, video_id: int):
        """Delete all frame embeddings for a video from Milvus"""
        expr = f"video_id == {video_id}"
        num_deleted = self.collection.delete(expr)
        self.collection.flush()
        logger.info(f"Deleted frames for video_id={video_id} from Milvus: {num_deleted}")
        return num_deleted

# Example usage
async def main():
    processor = VideoProcessor()
    
    # Process a video
    video_id = 1
    video_path = "/Users/tewff14/Documents/qmv3/some_real_video.mp4"
    
    processor.process_video(video_id, video_path)
    
    # Perform searches
    global_results = processor.search_global("dog playing fetch", "user123", limit=5)
    print("Global search results:", global_results)
    
    in_video_results = processor.search_in_video("sunset over ocean", video_id, limit=5)
    print("In-video search results:", in_video_results)

if __name__ == "__main__":
    asyncio.run(main())
