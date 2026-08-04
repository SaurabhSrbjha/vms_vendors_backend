# VMS Backend API - cURL Documentation

Base URL: `http://localhost:5000/api`

---

## Table of Contents
1. [Authentication Module](#1-authentication-module)
   - [1.1 Admin Login (Web)](#11-admin-login-web)
   - [1.2 Admin Login from Mobile (Device Validation Error Test)](#12-admin-login-from-mobile-device-validation-error-test)
   - [1.3 Employee Login (Mobile)](#13-employee-login-mobile)
   - [1.4 Employee Login from Web (Device Validation Error Test)](#14-employee-login-from-web-device-validation-error-test)
   - [1.5 Reception Login (Mobile)](#15-reception-login-mobile)
   - [1.6 Get Profile](#16-get-profile)
   - [1.7 Logout](#17-logout)
2. [Employee Management Module (Admin Only)](#2-employee-management-module-admin-only)
   - [2.1 View All Employees](#21-view-all-employees)
   - [2.2 View Employees with Search & Filters](#22-view-employees-with-search--filters)
   - [2.3 Get Employee by ID](#23-get-employee-by-id)
   - [2.4 Add New Employee](#24-add-new-employee)
   - [2.5 Add New Reception User](#25-add-new-reception-user)
   - [2.6 Edit Employee Details](#26-edit-employee-details)
   - [2.7 Activate / Deactivate Employee](#27-activate--deactivate-employee)

---

## 1. Authentication Module

### 1.1 Admin Login (Web)
Authenticates Admin user from web device.

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "device_type": "web"
  }'
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "employee_id": null,
    "username": "admin",
    "full_name": "admin",
    "role": "admin",
    "status": "active"
  }
}
```

---

### 1.2 Admin Login from Mobile (Device Validation Error Test)
Attempts Admin login with `device_type: "mobile"`.

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "device_type": "mobile"
  }'
```

#### Error Response (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Admin users are allowed to log in only from web devices."
}
```

---

### 1.3 Employee Login (Mobile)
Authenticates Employee user from mobile device using Employee ID as username and DOB as password.

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "EMP1001",
    "password": "1995-05-15",
    "device_type": "mobile"
  }'
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "employee_id": "EMP1001",
    "username": "EMP1001",
    "full_name": "John Doe",
    "role": "employee",
    "status": "active"
  }
}
```

---

### 1.4 Employee Login from Web (Device Validation Error Test)
Attempts Employee login with `device_type: "web"`.

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "EMP1001",
    "password": "1995-05-15",
    "device_type": "web"
  }'
```

#### Error Response (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Employee users are allowed to log in only from mobile devices."
}
```

---

### 1.5 Reception Login (Mobile)
Authenticates Reception user from mobile device.

```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "EMP1002",
    "password": "1998-08-20",
    "device_type": "mobile"
  }'
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 3,
    "employee_id": "EMP1002",
    "username": "EMP1002",
    "full_name": "Sarah Connor",
    "role": "reception",
    "status": "active"
  }
}
```

---

### 1.6 Get Profile
Fetches currently authenticated user profile.

```bash
curl -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": 1,
    "employee_id": null,
    "username": "admin",
    "role": "admin",
    "status": "active",
    "created_at": "2026-08-03T15:50:00.000Z",
    "updated_at": "2026-08-03T15:50:00.000Z",
    "full_name": "admin"
  }
}
```

---

### 1.7 Logout
Logs out authenticated session.

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## 2. Employee Management Module (Admin Only)

*Note: All endpoints below require Admin JWT token passed in `Authorization: Bearer <ADMIN_TOKEN>`.*

### 2.1 View All Employees
Retrieves list of all registered employees.

```bash
curl -X GET http://localhost:5000/api/employees \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Employees fetched successfully",
  "count": 2,
  "data": [
    {
      "id": 1,
      "employee_id": "EMP1001",
      "full_name": "John Doe",
      "dob": "1995-05-15",
      "mobile": "+1234567890",
      "email": "john@example.com",
      "department": "Engineering",
      "designation": "Software Developer",
      "role": "employee",
      "status": "active",
      "created_at": "2026-08-03T15:50:00.000Z",
      "updated_at": "2026-08-03T15:50:00.000Z"
    }
  ]
}
```

---

### 2.2 View Employees with Search & Filters
Filter employees by search keyword, role, or status.

```bash
curl -X GET "http://localhost:5000/api/employees?search=John&role=employee&status=active" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

---

### 2.3 Get Employee by ID
Retrieve details of a single employee by numeric record ID.

```bash
curl -X GET http://localhost:5000/api/employees/1 \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

---

### 2.4 Add New Employee
Creates employee record and automatically generates user account with:
- `username` = `employee_id`
- `password` = `dob` (hashed before saving)
- `role` = `employee` / `reception`
- `status` = `active`

```bash
curl -X POST http://localhost:5000/api/employees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "full_name": "John Doe",
    "employee_id": "EMP1001",
    "dob": "1995-05-15",
    "mobile": "+1234567890",
    "email": "john@example.com",
    "department": "Engineering",
    "designation": "Software Engineer",
    "role": "employee",
    "status": "active"
  }'
```

#### Success Response (`201 Created`)
```json
{
  "success": true,
  "message": "Employee created successfully and user account generated.",
  "data": {
    "id": 1,
    "employee_id": "EMP1001",
    "full_name": "John Doe",
    "dob": "1995-05-15",
    "mobile": "+1234567890",
    "email": "john@example.com",
    "department": "Engineering",
    "designation": "Software Engineer",
    "role": "employee",
    "status": "active"
  }
}
```

---

### 2.5 Add New Reception User
Creates employee record with role `reception`.

```bash
curl -X POST http://localhost:5000/api/employees \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "full_name": "Sarah Connor",
    "employee_id": "EMP1002",
    "dob": "1998-08-20",
    "mobile": "+1987654321",
    "email": "sarah@example.com",
    "department": "Front Desk",
    "designation": "Receptionist",
    "role": "reception",
    "status": "active"
  }'
```

---

### 2.6 Edit Employee Details
Updates employee attributes and synchronizes role and status in `users` table.

```bash
curl -X PUT http://localhost:5000/api/employees/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "full_name": "Johnathan Doe",
    "dob": "1995-05-15",
    "mobile": "+1234567890",
    "email": "john.doe@example.com",
    "department": "Engineering",
    "designation": "Senior Software Engineer",
    "role": "employee",
    "status": "active"
  }'
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Employee updated successfully.",
  "data": {
    "id": 1,
    "employee_id": "EMP1001",
    "full_name": "Johnathan Doe",
    "designation": "Senior Software Engineer",
    "role": "employee",
    "status": "active"
  }
}
```

---

### 2.7 Activate / Deactivate Employee
Toggles employee status (`active` or `inactive`) in both `employees` and `users` tables.

#### Deactivate Employee:
```bash
curl -X PATCH http://localhost:5000/api/employees/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "status": "inactive"
  }'
```

#### Activate Employee:
```bash
curl -X PATCH http://localhost:5000/api/employees/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "status": "active"
  }'
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Employee status changed to 'inactive'.",
  "data": {
    "id": 1,
    "employee_id": "EMP1001",
    "status": "inactive"
  }
}
```
