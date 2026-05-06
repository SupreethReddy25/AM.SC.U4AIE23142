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
-------------------------------------------------------------
Stage 3: Query Optimization
Query Analysis
Is the earlier developer's query accurate?
Yes, it correctly filters out the unread notifications for a specific student and sorts them so the newest ones show up first.

It's slow because there are 5,000,000 records and no indexes. The database is forced to do a Full Table Scan to find matches. On top of that, the ORDER BY createdAt DESC makes the database sort the filtered results in memory (a filesort), which is very expensive computationally.

I would cahnge:
I would add a Composite B-Tree Index on (studentID, isRead, createdAt DESC).
computation cost: Without the index, it's roughly O(N) for scanning plus O(K\log K) for sorting. With the composite index, the database just traverses the tree directly to the user's unread records in $O(\log N)$ time, and the sorting cost becomes O(1) because the index tree is already sorted.Indexing AdviceIs adding indexes on every column a good idea?Definitely not. Indexes aren't free. Every time a new notification is inserted (which happens a lot in this system), the database has to update every single index tree. Indexing every column would destroy our write performance and eat up a lot of RAM and disk space. We should only index columns that are heavily used in WHERE, JOIN, or ORDER BY clauses.Placement Notification QueryTo find all students who got a placement notification in the last 7 days:

SELECT DISTINCT studentID 
FROM notifications 
WHERE notificationType = 'Placement' 
AND createdAt >= NOW() - INTERVAL '7 days'
ORDER BY studentID;
--------------------------------------------------------
## Stage 4: Performance Improvement (Handling DB Overload)

### The Problem
Fetching notifications from the main database on every single page load for every student is a guaranteed way to crash the system. The database is getting hammered with repetitive read requests.

### My Suggested Solution: Caching with Redis
To fix this, we need to put a high-speed, in-memory caching layer—like **Redis**—in front of our database. Instead of querying PostgreSQL every time a student opens a page, we first check Redis. If the unread notifications are in the cache (a Cache Hit), we return them instantly. If not (a Cache Miss), we query the DB, store the result in Redis, and then return it.

### Tradeoffs of these Strategies

* **Directly Querying the Database (The current bad way):**
  * *Pros:* Data is always 100% accurate. You never have to worry about stale data.
  * *Cons:* Super slow latency, massive CPU/I/O strain on the DB, and it simply won't scale during peak times (like placement season).
* **Using a Redis Cache (My solution):**
  * *Pros:* Blazing fast (sub-millisecond reads) and completely offloads the read-heavy traffic from the primary database, keeping the system stable.
  * *Cons:* **Cache Invalidation.** This is the classic tradeoff. If a student marks a notification as read in the DB, but our backend fails to update or clear the Redis cache, the student will see stale "unread" notifications. It adds architectural complexity and extra infrastructure costs (RAM isn't cheap).
-----------------------------------------------

## Stage 5: Scaling the "Notify All" Feature

### Shortcomings of the Proposed Implementation
The pseudocode provided is honestly a disaster waiting to happen for 50,000 students. Here's why:
1. **Synchronous & Blocking:** Sending an email via an external API (like SendGrid or SES) usually takes about 100-300ms. In a sequential `for` loop, 50,000 emails will take roughly 3 to 4 hours to finish. The HR person clicking the button would be staring at a loading spinner forever.
2. **No Fault Tolerance:** Because the loop is synchronous, if the `send_email` function encounters an API rate limit or network error and throws an exception, the entire loop crashes. This is exactly why it failed midway for 200 students. The remaining students simply get nothing.
3. **No Retries:** Transient network errors happen all the time. There is no mechanism to retry a failed email.

### Should DB saving and emailing happen together?
**Absolutely not.** Saving to our own DB and pushing an in-app notification via WebSockets are fast, internal network operations. Sending an email relies on the unpredictable internet and third-party APIs. We must decouple them so that a slow email server doesn't delay a student's instant in-app alert.

### Redesigning for Reliability and Speed
We need an **Event-Driven, Asynchronous Architecture**. When HR clicks "Notify All", we should immediately do the fast internal tasks (DB insert and in-app push) using batching. Then, we push the email tasks to a **Message Queue** (like RabbitMQ, Kafka, or AWS SQS). Background worker servers will pick up these jobs and send the emails asynchronously at their own pace, automatically retrying if one fails.

### Revised Pseudocode
```python
function notify_all_fast(student_ids: array, message: string):
    # 1. Do the fast, internal operations in bulk
    batch_save_to_db(student_ids, message)
    batch_push_to_app(student_ids, message)
    
    # 2. Fire-and-forget emails to a Message Queue
    for student_id in student_ids:
        message_queue.publish(
            topic="email_jobs", 
            payload={"student_id": student_id, "message": message}
        )
    
    return "Notifications are being processed in the background!"

# --- Running on separate Background Worker Servers---
function consume_email_queue(job):
    try:
        send_email(job.student_id, job.message)
    except Exception as e:
        message_queue.retry_with_exponential_backoff(job)

---

## Stage 6: Priority Inbox Implementation

### My Approach
To build the Priority Inbox, I needed to fetch the raw notifications from the provided API and sort them based on the specific business rules.

1. **Assigning Weights:** First, I mapped the string types to a numeric weight so the sorting logic is straightforward. `Placement` gets a weight of 3, `Result` gets 2, and `Event` gets 1.
2. **Sorting Logic:** 
   * **Primary Sort (Weight):** I sort the array by these numeric weights in descending order (3s first, then 2s, then 1s).
   * **Secondary Sort (Recency):** If two notifications have the exact same weight (e.g., both are "Result"), I convert their `Timestamp` strings into actual Date objects and sort them descending (newest first).
3. **Extracting the Top N:** Once the entire list is accurately sorted, I just slice the first `n` elements from the array to get the top 10 (or whatever number the user wants).

### How to maintain the top 10 efficiently?
While standard array sorting (which is $O(N \log N)$) is perfectly fine for a one-off API fetch, it doesn't scale well if new notifications are constantly streaming in via WebSockets in real-time. 

To maintain a rolling "Top 10" efficiently with continuous new data, I would use a **Min-Heap (Priority Queue)** data structure constrained to a size of `k=10`. As each new notification arrives, we compare its priority to the minimum element in our heap (the least important of the top 10). If the new notification is more important, we pop the min element and insert the new one. This reduces the time complexity of handling a new notification from $O(N \log N)$ down to just $O(\log K)$, making it highly efficient at scale.