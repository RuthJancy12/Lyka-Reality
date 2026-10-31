from fastapi import APIRouter
from app.routers import (
    leads as leads_router,
    properties as properties_router,
    staff as staff_router,
    customer as customer_router,
    security as security_router,
    property_analytics as property_analytics_router,
    careers as careers_router,
    support as support_router,
    deals as deals_router,
    notifications as notifications_router,
    contact_center as contact_center_router,
    hrms as hrms_router,
)

api_router = APIRouter()

# Register all modular domain routers
api_router.include_router(leads_router.router)
api_router.include_router(properties_router.router)
api_router.include_router(staff_router.router)
api_router.include_router(customer_router.router)
api_router.include_router(security_router.router)
api_router.include_router(property_analytics_router.router)
api_router.include_router(careers_router.router)
api_router.include_router(support_router.router)
api_router.include_router(deals_router.router)
api_router.include_router(notifications_router.router)
api_router.include_router(contact_center_router.router)
api_router.include_router(hrms_router.router)

