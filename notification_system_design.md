# Campus Notifications System Design

## Stage 1

### APIs
We need two main APIs: one to get notifications and one to mark them as read.

**1. Fetch Notifications**
`GET /api/notifications`
Response:
```json
{
  "data": [
    {
      "id": "1234",
      "type": "Event",
      "message": "Tech Fest registration open",
      "isRead": false,
      "createdAt": "2026-04-22T17:50:06Z"
    }
  ]
}
2. Mark as Read
PATCH /api/notifications/{id}/read

For real-time delivery, I will use WebSockets. HTTP polling makes too many requests. WebSockets keep a connection open so the server can push notifications to the student instantly when something happens.
-----------------------------------------------------------------------------------------------------

Stage 2
Database
I chose PostgreSQL because we need structured relational data to link notifications to students.
CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    studentID INT NOT NULL,
    notificationType VARCHAR(50),
    message TEXT,
    isRead BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

As the table gets huge, queries will get slow.
Solutions:

Partitioning: Split the table by month so the database doesn't have to search one massive table.

Read Replicas: Route all the GET traffic to a replica database to reduce the load on the main write database.
-----------------------------------------------------------------------------------------------------

Stage 3
The query is accurate, but it's very slow because there are no indexes. The database has to scan all 5,000,000 rows (Full Table Scan) and sort them in memory.

I would add a Composite Index on (studentID, isRead, createdAt DESC). This makes filtering and sorting extremely fast.

We should not add indexes on every column. Indexes take up storage, and they slow down INSERT and UPDATE queries because the index tree has to update every time a new notification is added.

Query for Placements in the last 7 days:
SELECT DISTINCT studentID FROM notifications 
WHERE notificationType = 'Placement' 
AND createdAt >= NOW() - INTERVAL '7 days';
-----------------------------------------------------------------------------------------------------

Stage 4
Fetching from the DB on every single page load will overwhelm the database and cause timeouts.

Solution: Use an in-memory cache like Redis. When a student opens the page, we check Redis. If the notifications are there, return them instantly. If not, fetch from DB and save to Redis.

Tradeoffs:

DB Queries: Always accurate, but too slow for high traffic.

Redis Cache: Very fast, but cache invalidation is hard. If a student reads a notification and the cache doesn't update properly, they will see stale data.
-----------------------------------------------------------------------------------------------------

Stage 5
The pseudocode is bad because it runs synchronously. Sending an email takes time. Looping 50,000 times will freeze the system. Also, if one email fails, the loop crashes and the rest of the students get nothing.

Saving to the DB and sending the email should NOT happen together. DB inserts are fast, emails are slow.

We need a Message Queue (like RabbitMQ). We save to the DB immediately, then push the email tasks to the queue. Background workers will process the emails asynchronously.

function notify_all(student_ids, message) {
    batch_save_to_db(student_ids, message);
    batch_push_to_app(student_ids, message);
    
    for (let id of student_ids) {
        message_queue.push({ id, message });
    }
}
-----------------------------------------------------------------------------------------------------
Stage 6
My approach for the priority inbox:

Assign weights: Placement = 3, Result = 2, Event = 1.

Sort the notifications based on weight (highest first).

If two notifications have the same weight, sort them by timestamp (newest first).

Slice the array to get the top n items.

To maintain the top 10 efficiently as new notifications keep arriving, sorting the entire array every time is too slow. Instead, I would use a Min-Heap (Priority Queue) with a fixed size of 10. When a new notification arrives, I compare it to the lowest priority item in the heap. If the new one is more important, I replace it. This is much more efficient for real-time updates.