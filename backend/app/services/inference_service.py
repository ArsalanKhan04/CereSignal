"""
Inference service for EEG analysis using Celery
"""

import os
import sys
from typing import Optional, Dict, Any
from celery import Celery
from celery.result import AsyncResult
from app.core.logging_config import logger

# Add the project root to Python path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Celery configuration
_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = _redis_url
CELERY_RESULT_BACKEND = _redis_url

# Initialize Celery app
inference_app = Celery('inference', broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

class InferenceService:
    """Service for managing EEG inference tasks"""
    
    def __init__(self):
        self.app = inference_app
    
    def start_inference(self, file_path: str) -> str:
        """
        Start inference task for an EEG file
        
        Args:
            file_path: Path to the EDF file
            
        Returns:
            task_id: Celery task ID
        """
        try:
            # Import the inference task from the inference module
            from inference.infer import infer
            
            # Queue the inference task
            task = infer.delay(file_path)
            
            return task.id
        except Exception as e:
            logger.error("Error starting inference task", exc_info=True)
            raise
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        Get the status of an inference task
        
        Args:
            task_id: Celery task ID
            
        Returns:
            Dict with status information
        """
        try:
            result = AsyncResult(task_id, app=self.app)
            
            if result.state == 'PENDING':
                return {
                    'status': 'pending',
                    'message': 'Task is waiting to be processed'
                }
            elif result.state == 'PROGRESS':
                return {
                    'status': 'processing',
                    'message': 'Task is being processed',
                    'progress': result.info.get('progress', 0) if result.info else 0
                }
            elif result.state == 'SUCCESS':
                return {
                    'status': 'completed',
                    'message': 'Task completed successfully',
                    'result': result.result
                }
            elif result.state == 'FAILURE':
                return {
                    'status': 'failed',
                    'message': 'Task failed',
                    'error': str(result.info)
                }
            else:
                return {
                    'status': 'unknown',
                    'message': f'Unknown task state: {result.state}'
                }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error checking task status: {str(e)}'
            }
    
    def is_task_completed(self, task_id: str) -> bool:
        """
        Check if a task is completed (success or failure)
        
        Args:
            task_id: Celery task ID
            
        Returns:
            True if task is completed, False otherwise
        """
        status = self.get_task_status(task_id)
        return status['status'] in ['completed', 'failed']
    
    def get_inference_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the inference result if task is completed
        
        Args:
            task_id: Celery task ID
            
        Returns:
            Inference result or None if not completed
        """
        status = self.get_task_status(task_id)
        
        if status['status'] == 'completed':
            return status.get('result')
        elif status['status'] == 'failed':
            return {'result': 'failed', 'error': status.get('error', 'Unknown error')}
        
        return None

# Global instance
inference_service = InferenceService()
