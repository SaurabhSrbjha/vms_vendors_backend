# VMS Backend API Documentation

Base URL: `http://localhost:5000/api`

Refer to [curl.md](file:///Users/apple/Documents/vmsBackends/vms_vendors_backend/curl.md) for complete cURL examples and detailed request/response structures.

## Endpoints Summary

### 1. Authentication
- `POST /api/login` - Common login endpoint for Admin (`web`), Employee (`mobile`), and Reception (`mobile`).
- `GET /api/auth/profile` - Get logged-in user profile (JWT protected).
- `POST /api/auth/logout` - Logout endpoint.

### 2. Employee Management (Admin Only)
- `GET /api/employees` - List employees with search & role/status filtering.
- `GET /api/employees/:id` - Get employee by ID.
- `POST /api/employees` - Add employee (Auto creates user with username = `employee_id` and password = `dob`).
- `PUT /api/employees/:id` - Edit employee.
- `PATCH /api/employees/:id/status` - Activate / Deactivate employee.
