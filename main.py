from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import json
import os
import re
from datetime import datetime
from anthropic import Anthropic

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="FPSO Compliance Report Generator",
    description="AI-powered compliance reports for FPSO operations",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Anthropic client
client = Anthropic()

# Models
class OperationalLog(BaseModel):
    date: str
    vessel_name: str
    watch_start: str
    watch_end: str
    chief_officer: str
    operational_summary: str
    equipment_status: dict = Field(default_factory=dict)
    incidents: str = ""
    maintenance_performed: list = Field(default_factory=list)
    fuel_oil_quantity: str = ""
    weather_conditions: str = ""
    remarks: str = ""

class ReportRequest(BaseModel):
    logs: OperationalLog
    language: str = "en"
    format: str = "json"

class ReportResponse(BaseModel):
    status: str
    report: dict
    generated_at: str
    vessel_name: str

# Compliance prompt template
def get_compliance_prompt(logs: OperationalLog, language: str) -> str:
    lang_dict = {
        "en": {
            "title": "SOLAS/IMO Compliance Report",
            "summary": "Executive Summary",
            "equipment": "Equipment Status",
            "incidents": "Incidents and Anomalies",
            "maintenance": "Maintenance Performed",
            "checklist": "Regulatory Compliance Checklist",
            "recommendations": "Recommendations"
        },
        "pt": {
            "title": "Relatório de Conformidade SOLAS/IMO",
            "summary": "Resumo Executivo",
            "equipment": "Status dos Equipamentos",
            "incidents": "Incidentes e Anomalias",
            "maintenance": "Manutenção Realizada",
            "checklist": "Lista de Verificação de Conformidade Regulatória",
            "recommendations": "Recomendações"
        }
    }

    lang = lang_dict.get(language, lang_dict["en"])

    prompt = f"""You are an expert FPSO (Floating Production Storage Offloading) compliance officer.

Generate a professional SOLAS/IMO compliance report from the provided operational logs.

VESSEL INFORMATION:
- Vessel: {logs.vessel_name}
- Date: {logs.date}
- Watch: {logs.watch_start} - {logs.watch_end}
- Chief Officer: {logs.chief_officer}

OPERATIONAL DATA:
- Summary: {logs.operational_summary}
- Equipment Status: {json.dumps(logs.equipment_status, indent=2)}
- Incidents: {logs.incidents if logs.incidents else "None reported"}
- Maintenance: {', '.join(logs.maintenance_performed) if logs.maintenance_performed else "Routine operations only"}
- Fuel Oil: {logs.fuel_oil_quantity if logs.fuel_oil_quantity else "Not specified"}
- Weather: {logs.weather_conditions if logs.weather_conditions else "Normal conditions"}
- Remarks: {logs.remarks if logs.remarks else "No additional remarks"}

REQUIREMENTS:
1. Use {language.upper()} language
2. Format as structured JSON sections
3. Include SOLAS/IMO compliance assessment
4. Professional tone, regulatory compliant
5. 400-600 words total

REPORT SECTIONS (must include all):
1. Executive Summary (50-75 words)
2. Equipment Status Assessment
3. Incident Analysis (if any)
4. Maintenance Review
5. Regulatory Compliance Checklist (at least 8 items)
6. Safety Recommendations
7. Officer Sign-off Template

Return ONLY valid JSON with these exact keys:
{{
  "executive_summary": "...",
  "equipment_status": "...",
  "incident_analysis": "...",
  "maintenance_review": "...",
  "compliance_checklist": ["item 1", "item 2", ...],
  "recommendations": "...",
  "sign_off_template": "Prepared by: _____ Date: _____ Signature: _____"
}}

Generate the report now:"""

    return prompt


def extract_json(text: str) -> dict:
    """Parse a JSON object out of a Claude response, tolerating markdown code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text.strip()
    return json.loads(candidate)


@app.get("/")
async def root():
    """Root endpoint - serves frontend"""
    return FileResponse("templates/index.html")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    return {
        "status": "ok",
        "service": "FPSO Compliance Report Generator",
        "claude_api": "configured" if api_key else "missing",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/generate-report", response_model=ReportResponse)
async def generate_report(request: ReportRequest):
    """Generate compliance report from operational logs"""

    try:
        # Validate API key
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

        # Validate language
        if request.language not in ["en", "pt"]:
            raise HTTPException(status_code=400, detail="Language must be 'en' or 'pt'")

        # Build prompt
        prompt = get_compliance_prompt(request.logs, request.language)

        # Call Claude API
        message = client.messages.create(
            model="claude-opus-5",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        # Extract response
        response_text = message.content[0].text

        # Parse JSON response
        try:
            report_data = extract_json(response_text)
        except json.JSONDecodeError:
            report_data = {
                "executive_summary": response_text,
                "equipment_status": "See summary",
                "incident_analysis": "See summary",
                "maintenance_review": "See summary",
                "compliance_checklist": ["See summary"],
                "recommendations": "See summary",
                "sign_off_template": "Prepared by: _____ Date: _____ Signature: _____"
            }

        return ReportResponse(
            status="success",
            report=report_data,
            generated_at=datetime.now().isoformat(),
            vessel_name=request.logs.vessel_name
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@app.post("/api/sample-logs")
async def get_sample_logs():
    """Get sample FPSO operational logs for testing"""
    sample = {
        "date": "2024-09-21",
        "vessel_name": "FPSO Santos",
        "watch_start": "08:00",
        "watch_end": "16:00",
        "chief_officer": "John Smith",
        "operational_summary": "Normal operations, all systems nominal. Production stable at 50,000 BOPD.",
        "equipment_status": {
            "separator": "operational",
            "fuel_system": "operational",
            "power_generation": "operational",
            "compression": "operational",
            "storage_tanks": "nominal",
            "export_system": "operational"
        },
        "incidents": "None",
        "maintenance_performed": [
            "Routine separator inspection completed",
            "Fuel line flushing performed",
            "Generator maintenance log reviewed"
        ],
        "fuel_oil_quantity": "2450 tons",
        "weather_conditions": "Sea state 3-4, wind 15-20 knots, visibility good",
        "remarks": "All operations normal. Next scheduled maintenance: 2024-09-25. No safety concerns."
    }
    return sample

try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception:
    pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
