import os
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from chatbot import generate_response
from ai_detection import analyze_image_ai_detection
from repair_verification import verify_same_pothole_repair

load_dotenv()

app = FastAPI(title='CivicPulse Python Chatbot')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

class ChatRequest(BaseModel):
    message: str
    userId: Optional[str] = None
    userName: Optional[str] = None
    sessionId: Optional[str] = None

class ChatResponse(BaseModel):
    content: str
    sessionId: str


class ImageAnalysisRequest(BaseModel):
    imageBase64: str


class ImageAnalysisResponse(BaseModel):
    isManipulated: bool
    isAIGenerated: bool
    manipulationType: str
    confidence: int
    artifacts: dict
    reasons: list
    recommendations: list
    analysisMethod: str
    metrics: dict


class GPSCoordinates(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class VerifyRepairRequest(BaseModel):
    beforeImage: str
    afterImage: str
    beforeGps: Optional[GPSCoordinates] = None
    afterGps: Optional[GPSCoordinates] = None
    maxGpsRadius: Optional[float] = 50.0


@app.get('/health')
async def health():
    return {'status': 'ok', 'service': 'CivicPulse Python Chatbot'}


@app.post('/chat/citizen', response_model=ChatResponse)
async def citizen_chat(request: ChatRequest):
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail='Message required')

    content, session_id = await generate_response(
        request.message,
        request.userId,
        request.userName,
        request.sessionId,
    )
    return {'content': content, 'sessionId': session_id}


@app.post('/ai/detect-image', response_model=ImageAnalysisResponse)
async def detect_ai_image(request: ImageAnalysisRequest):
    """Analyze image for AI generation and manipulation"""
    if not request.imageBase64:
        raise HTTPException(status_code=400, detail='imageBase64 required')
    
    try:
        result = analyze_image_ai_detection(request.imageBase64)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Analysis failed: {str(e)}')


@app.post('/ai/verify-repair')
async def verify_repair(request: VerifyRepairRequest):
    """Verify whether AFTER photo shows the same pothole location repaired"""
    if not request.beforeImage or not request.afterImage:
        raise HTTPException(status_code=400, detail='Both beforeImage and afterImage are required')
    
    try:
        before_gps_dict = request.beforeGps.model_dump() if request.beforeGps else None
        after_gps_dict = request.afterGps.model_dump() if request.afterGps else None
        
        result = verify_same_pothole_repair(
            request.beforeImage,
            request.afterImage,
            before_gps=before_gps_dict,
            after_gps=after_gps_dict,
            max_gps_radius=request.maxGpsRadius or 50.0
        )
        return result
    except Exception as e:
        print(f"Repair verification failed error: {e}")
        raise HTTPException(status_code=500, detail=f'Verification failed: {str(e)}')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=int(os.getenv('PYTHON_CHATBOT_PORT', 8000)), reload=True)

