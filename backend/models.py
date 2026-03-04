from sqlalchemy import Column, Integer, String, DateTime, Date, Float
from sqlalchemy.sql import func
from database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, nullable=True)

    # Identification
    sale_type = Column(String, nullable=True)  # "Venta" or "Pack"
    sale_id = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True)
    remitente_id = Column(String, nullable=True)  # ML account identifier

    # Product
    product_name = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    color = Column(String, nullable=True)
    voltage = Column(String, nullable=True)
    quantity = Column(Integer, default=1)

    # Destination
    recipient_name = Column(String, nullable=True)
    recipient_user = Column(String, nullable=True)
    address = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    city = Column(String, nullable=True)
    partido = Column(String, nullable=True)  # district / partido
    province = Column(String, nullable=True)
    reference = Column(String, nullable=True)

    # Shipping
    shipping_method = Column(String, nullable=True)  # "flex", "colecta"
    carrier_code = Column(String, nullable=True)  # route code like SBU4, SCK1
    carrier_name = Column(String, nullable=True)  # OCASA, PICKIT, etc.
    assigned_carrier = Column(String, nullable=True)  # Flex carrier assignment
    dispatch_date = Column(String, nullable=True)
    delivery_date = Column(String, nullable=True)

    # Status
    status = Column(String, default="pendiente")  # pendiente, encontrado, empaquetado, despachado

    created_at = Column(DateTime, server_default=func.now())


class ZoneMapping(Base):
    __tablename__ = "zone_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    partido = Column(String, nullable=False, unique=True)
    carrier_name = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Carrier(Base):
    __tablename__ = "carriers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    display_name = Column(String, nullable=True)
    color = Column(String, nullable=True)  # For UI display
    created_at = Column(DateTime, server_default=func.now())


class DailyBatch(Base):
    __tablename__ = "daily_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, server_default=func.current_date())
    total_packages = Column(Integer, default=0)
    filenames = Column(String, nullable=True)  # comma-separated
    created_at = Column(DateTime, server_default=func.now())
