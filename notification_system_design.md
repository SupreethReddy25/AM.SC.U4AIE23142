# Stage 1
### Core Actions Supported
1. fetch all notifications for a logged-in user.
2. Mark a specific notification a read.

### REST API Endpoints & Contracts
**1. Fetch Notifications**
* **Endpoint:** `GET /api/v1/notifications`
* **Headers:** 
  `Authorization: Bearer <token>`
* **Request:** None
* **Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "type": "event",
      "message": "Tech Fest Tomorrow",
      "isRead": false,
      "createdAt": "2026-04-22T17:50:06Z"
    }
  ]
}

2. Mark Notification as Read

Endpoint: PATCH /api/v1/notifications/{id}/read

Headers:
Authorization: Bearer <token>

Request Body: None

Response (200 OK):
{
  "status": "success",
  "message": "Notification marked as read"
}
Real-Time Mechanism
WebSockets (WSS): WebSockets provide a persistent, bidirectionaland fullduplex TCP connection. When a new notification is generated in the backend, the server immediately pushes the JSON payload to the specific student's active WebSocket connection, ensuring sub-second real-time delivery without the overhead of HTTP polling.

# Stage 2

### Persistent Storage Choice
**PostgreSQL (Relational Database)**
Notifications require strong data integrity, and relationships with the `students` table are highly structured. PostgreSQL handles high-concurrency read/write operations effectively and supports advanced indexing mechanisms (like composite indexes) which are crucial for time-series and filtered querying.

### DB Schema
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studentID INT NOT NULL,
    notificationType VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
Problems with Data Volume & Solutions
Problems:

Table size inflation slowing down read queries (full table scans).

High write throughput causing database locking.

Solutions:

Partitioning: Partition the notifications table by createdAt (e.g., monthly) to keep index trees small.

Archival: Move notifications older than 90 days to cold storage (e.g., AWS S3).

Read Replicas: Route all GET API calls to read replicas to offload the primary write database.

Queries based on Stage 1
Fetch: SELECT * FROM notifications WHERE studentID = ? ORDER BY createdAt DESC LIMIT 50;

Mark Read: UPDATE notifications SET isRead = true WHERE id = ? AND studentID = ?;