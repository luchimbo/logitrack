from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgencyContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    phone: str | None = None
    whatsapp_url: str | None = None
    notes: str | None = None


class AgencyContactRead(BaseModel):
    id: int
    name: str
    normalized_name: str
    phone: str | None
    whatsapp_url: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
