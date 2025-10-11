"""
Signal processing endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.signal import SignalFile, ProcessingResult
from app.schemas.signal import (
    ProcessingRequest,
    ProcessingResultResponse,
    ProcessingResultCreate
)
from app.utils.signal_processing import process_signal

router = APIRouter()


@router.post("/process", response_model=ProcessingResultResponse)
async def process_signal_data(
    request: ProcessingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Process signal data with specified parameters"""
    
    # Check if file exists
    file = db.query(SignalFile).filter(SignalFile.id == request.file_id).first()
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signal file not found"
        )
    
    # Check if file is processed
    if not file.processed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be processed before signal processing"
        )
    
    try:
        # Process the signal
        result_data = await process_signal(
            file_id=request.file_id,
            signal_id=request.signal_id,
            processing_type=request.processing_type,
            parameters=request.parameters or {}
        )
        
        # Save processing result
        processing_result = ProcessingResult(
            file_id=int(request.file_id),
            signal_id=int(request.signal_id) if request.signal_id else None,
            processing_type=request.processing_type,
            parameters=str(request.parameters) if request.parameters else None,
            result_data=str(result_data)
        )
        
        db.add(processing_result)
        db.commit()
        db.refresh(processing_result)
        
        return processing_result
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing signal: {str(e)}"
        )


@router.get("/results", response_model=List[ProcessingResultResponse])
async def get_processing_results(
    file_id: int = None,
    processing_type: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get processing results with optional filters"""
    
    query = db.query(ProcessingResult)
    
    if file_id:
        query = query.filter(ProcessingResult.file_id == file_id)
    
    if processing_type:
        query = query.filter(ProcessingResult.processing_type == processing_type)
    
    results = query.offset(skip).limit(limit).all()
    return results


@router.get("/results/{result_id}", response_model=ProcessingResultResponse)
async def get_processing_result(
    result_id: int,
    db: Session = Depends(get_db)
):
    """Get specific processing result by ID"""
    
    result = db.query(ProcessingResult).filter(ProcessingResult.id == result_id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Processing result not found"
        )
    
    return result


@router.delete("/results/{result_id}")
async def delete_processing_result(
    result_id: int,
    db: Session = Depends(get_db)
):
    """Delete a processing result"""
    
    result = db.query(ProcessingResult).filter(ProcessingResult.id == result_id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Processing result not found"
        )
    
    try:
        db.delete(result)
        db.commit()
        
        return {"message": "Processing result deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting processing result: {str(e)}"
        )