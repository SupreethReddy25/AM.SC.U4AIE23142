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