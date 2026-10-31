from enum import Enum
from typing import Set


class UserRole(str, Enum):
    ADMIN = "admin"
    HRMS_ADMIN = "hrms_admin"
    SALES_AGENT = "sales_agent"
    SALESPERSON = "salesperson"
    MANAGER = "manager"
    CUSTOMER = "customer"


# Staff roles that are forbidden from using the Customer-Facing AI Voice/Chat endpoints
STAFF_ROLES: Set[str] = {
    UserRole.ADMIN.value,
    UserRole.HRMS_ADMIN.value,
    UserRole.SALES_AGENT.value,
    UserRole.SALESPERSON.value,
    UserRole.MANAGER.value,
    "historical_manager",
    "staff",
}

# HRMS Admin permission scopes
HRMS_PERMISSIONS: Set[str] = {
    "employee_directory",
    "attendance_management",
    "leave_management",
    "payroll_management",
    "recruitment",
    "performance",
    "hr_reports",
}


def is_staff_role(role: str) -> bool:
    """Returns True if the role is any internal staff or admin role."""
    if not role:
        return False
    return role.strip().lower() in STAFF_ROLES


def is_customer_role(role: str) -> bool:
    """Returns True if the role is a consumer/customer."""
    if not role:
        return True  # Anonymous public visitors default to customer access
    return role.strip().lower() == UserRole.CUSTOMER.value or not is_staff_role(role)

