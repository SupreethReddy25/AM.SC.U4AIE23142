# Campus Notifications Microservice Design

## Stage 1: API Design & Real-Time Delivery

### Core Actions
To handle the notification system for logged-in students, we primarily need two things:
1. Fetching all the notifications for the current user.
2. Marking a specific notification as "read" once the user clicks on it.

### REST API Endpoints

**1. Fetch Notifications**
* **Endpoint:** `GET /api/v1/notifications`
* **Headers:** `Authorization: Bearer <token>`
* **Response (200 OK):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "type": "Event",
      "message": "Tech Fest registrations are closing soon!",
      "isRead": false,
      "createdAt": "2026-04-22T17:50:06Z"
    }
  ]
}
2. Mark as Read

Endpoint: PATCH /api/v1/notifications/{id}/read
Headers: Authorization: Bearer <token>
Response (200 OK):
{
  "status": "success",
  "message": "Notification updated successfully"
}
Real-Time Mechanism
For real-time updates, I would use WebSockets (WSS). Since students need instant updates for things like placement results, HTTP polling would create way too much unnecessary overhead on our servers. WebSockets keep a persistent, two-way connection open, allowing the backend to instantly push the JSON payload to the specific student's client the moment an event is triggered.

Stage 2: Persistent Storage
Database Choice
I suggest using PostgreSQL. Notifications need strict data integrity and will likely have relational ties to a students or users table. Postgres is excellent at handling high-concurrency read/write operations and supports advanced indexing, which we will definitely need for time-series data like notifications.

db Schema:
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    studentID INT NOT NULL,
    notificationType VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
Handling Data Volume Growth
As data grows, two main problems will pop up: table size inflation causing slow reads (full table scans), and high write throughput causing database locking.

Solutions:
Partitioning:We can partition the notifications table by createdAt (e.g., month-by-month). This keeps the index trees small and fast
Archivall strategy: Notifications older than 3 to 6 months rarely get checked. We can move them to cold storage (like AWS S3) to keep the primary database lean.

Read Replicas: Since users fetch notifications way more often than they generate them, we can route all GET requests to a read-replica database to take the load off the main write instance.

Queries based on Stage 1:

Fetch: SELECT * FROM notifications WHERE studentID = ? ORDER BY createdAt DESC LIMIT 50;
Mark Read: UPDATE notifications SET isRead = true WHERE id = ? AND studentID = ?;

Stage 3: Query Optimization
Query Analysis
Is the earlier developer's query accurate?
Yes, it correctly filters out the unread notifications for a specific student and sorts them so the newest ones show up first.

It's slow because there are 5,000,000 records and no indexes. The database is forced to do a Full Table Scan to find matches. On top of that, the ORDER BY createdAt DESC makes the database sort the filtered results in memory (a filesort), which is very expensive computationally.

I would cahnge:
I would add a Composite B-Tree Index on (studentID, isRead, createdAt DESC).
computation cost: Without the index, it's roughly $O(N)$ for scanning plus $O(K \log K)$ for sorting. With the composite index, the database just traverses the tree directly to the user's unread records in $O(\log N)$ time, and the sorting cost becomes $O(1)$ because the index tree is already sorted.Indexing AdviceIs adding indexes on every column a good idea?Definitely not. Indexes aren't free. Every time a new notification is inserted (which happens a lot in this system), the database has to update every single index tree. Indexing every column would destroy our write performance and eat up a lot of RAM and disk space. We should only index columns that are heavily used in WHERE, JOIN, or ORDER BY clauses.Placement Notification QueryTo find all students who got a placement notification in the last 7 days:

SELECT DISTINCT studentID 
FROM notifications 
WHERE notificationType = 'Placement' 
AND createdAt >= NOW() - INTERVAL '7 days'
ORDER BY studentID;