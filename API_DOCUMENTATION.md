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
- `POST /api/employees` - Add employee (Auto creates user with username = `EMP_ID + last 6 digits of mobile` and password = `EMP_ID + DDMMYYYY of DOB`).
- `PUT /api/employees/:id` - Edit employee.
- `PATCH /api/employees/:id/status` - Activate / Deactivate employee.
- `DELETE /api/employees/:id` - Delete employee record and associated user account.

### 3. Visitor Management Module
- `POST /api/visitors/pre-register` - Employee pre-registers a visitor for themselves (Status is auto-set to `APPROVED`).
- `POST /api/visitors` - Receptionist / Admin adds visitor record (accepts Base64 photo, defaults status to `PENDING`).
- `GET /api/visitors` - View visitors list (Admin & Reception view all, Employee views assigned visitors).
- `GET /api/visitors/:id` - Get single visitor details by numeric ID or `visitor_id`.
- `PATCH /api/visitors/:id/status` - Employee / Admin updates visitor status (`APPROVED` / `REJECTED`).
- `POST /api/visitors/:id/approve` - Host Employee / Admin approves visitor request.
- `POST /api/visitors/:id/reject` - Host Employee / Admin rejects visitor request.


